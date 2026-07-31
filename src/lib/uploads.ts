import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rm, rename, stat } from "fs/promises";
import { query } from "@/lib/db";

/**
 * Public drop-box behind /upload.
 *
 * Threat model: the URL is meant to be handed out (QR code), so anyone who
 * finds it can POST. The endpoint must therefore be safe against a hostile
 * stranger, not just a clumsy friend. The defences, in order:
 *
 *  1. ALLOWLIST — only the media/document types below are accepted. Everything
 *     else (executables, scripts, archives, .sql dumps, HTML/SVG, macro-enabled
 *     Office, databases) is rejected. A denylist would be a losing game; the
 *     allowlist means an unknown extension fails closed.
 *  2. CONTENT SNIFFING — the declared extension must match the file's actual
 *     magic bytes. `payload.sql` renamed to `payload.pdf` fails: no `%PDF-`.
 *  3. OPAQUE STORAGE — files are written under a server-generated key
 *     (`YYYY/MM/<32 hex>`) with NO extension, outside the Next.js web root, so
 *     nothing is ever statically served, path-traversed, or executed.
 *  4. NO PROCESSING — the server never opens, parses, thumbnails, transcodes or
 *     unpacks an upload. Bytes in, bytes out. A malicious file is inert here.
 *  5. QUOTAS — per-IP byte/file limits, per-submission caps, and a global disk
 *     ceiling, so the box can't be used as free storage or filled to DoS.
 *  6. OWNER-ONLY READ — the bytes come back only through an authenticated
 *     dashboard route, as an attachment, with nosniff + a locked-down CSP.
 */

// ─── Limits ──────────────────────────────────────────────────────────────────
// Deliberately conservative: the host has ~10 GB free and 3.8 GB RAM.

export const MAX_FILES_PER_SUBMISSION = 15;
export const MAX_SUBMISSION_BYTES = 500 * 1024 * 1024; // 500 MB across all files
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024; // hard ceiling on one PUT body
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Per-IP ceiling over a rolling day. */
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const QUOTA_BYTES_PER_IP = 1024 * 1024 * 1024; // 1 GB / IP / day
export const QUOTA_FILES_PER_IP = 40;

/** Refuse everything once the store grows past this, to protect the host. */
export const GLOBAL_STORE_LIMIT_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/var/www/kama-next/uploads";

// Paths are built by string concatenation rather than path.join/resolve on
// purpose: the bundler's file tracer treats `path.*` calls on runtime values as
// a signal to trace the whole project into the standalone output. Safety here
// comes from `safeStoragePath`'s strict key format, not from path normalisation.
const TMP_DIR = `${UPLOAD_DIR}/.tmp`;

// ─── Type allowlist ──────────────────────────────────────────────────────────

export type Family = "image" | "video" | "audio" | "document" | "text";

interface TypeRule {
  /** Canonical type. This — never the browser's claim — is what we store/serve. */
  mime: string;
  family: Family;
  /** Does the file's leading bytes actually look like this format? */
  check: (head: Buffer) => boolean;
}

const MB = 1024 * 1024;

/** Per-family size ceiling. Video gets room; text has no excuse to be large. */
const FAMILY_MAX_BYTES: Record<Family, number> = {
  image: 50 * MB,
  video: 250 * MB,
  audio: 100 * MB,
  document: 100 * MB,
  text: 5 * MB,
};

// -- magic-byte helpers --
const at = (h: Buffer, off: number, ...bytes: number[]) =>
  h.length >= off + bytes.length && bytes.every((b, i) => h[off + i] === b);

const ascii = (h: Buffer, off: number, s: string) =>
  h.length >= off + s.length && h.subarray(off, off + s.length).toString("latin1") === s;

/** ISO base-media container (MP4/MOV/HEIC/…): `....ftyp<brand>`. */
const ftyp = (h: Buffer, brands: string[]) =>
  ascii(h, 4, "ftyp") && brands.some((b) => ascii(h, 8, b));

/** RIFF container with a specific form type (WEBP/WAV/AVI). */
const riff = (h: Buffer, form: string) => ascii(h, 0, "RIFF") && ascii(h, 8, form);

/** ZIP local file header — the envelope for every OOXML / ODF / EPUB file. */
const zipped = (h: Buffer) => at(h, 0, 0x50, 0x4b) && (at(h, 2, 0x03, 0x04) || at(h, 2, 0x05, 0x06) || at(h, 2, 0x07, 0x08));

/**
 * Plain text: no NUL bytes and decodes as UTF-8. Cheap, and the only check that
 * matters — text is never executed, only displayed.
 */
const isText = (h: Buffer) => {
  if (h.includes(0)) return false;
  const probe = h.subarray(0, Math.min(h.length, 4096));
  return Buffer.compare(Buffer.from(probe.toString("utf8"), "utf8"), probe) === 0;
};

/**
 * The complete set of accepted types.
 *
 * NOT accepted, by design — each is either directly executable, a container we
 * cannot see inside, or a known parser-exploit vector:
 *   executables/scripts  exe dll msi apk deb jar sh bat ps1 py php js vbs hta …
 *   archives             zip rar 7z tar gz iso dmg   (opaque; could hold anything)
 *   database dumps       sql db sqlite mdb dump bak  (explicitly out of scope)
 *   active markup        html svg xml xhtml          (script execution / XXE)
 *   legacy + macro Office doc xls ppt docm xlsm pptm  (OLE / VBA macros)
 *
 * To accept a new type, add a row here WITH a real magic-byte check.
 */
const ALLOWED: Record<string, TypeRule> = {
  // images
  jpg:  { mime: "image/jpeg",   family: "image", check: (h) => at(h, 0, 0xff, 0xd8, 0xff) },
  jpeg: { mime: "image/jpeg",   family: "image", check: (h) => at(h, 0, 0xff, 0xd8, 0xff) },
  png:  { mime: "image/png",    family: "image", check: (h) => at(h, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  gif:  { mime: "image/gif",    family: "image", check: (h) => ascii(h, 0, "GIF87a") || ascii(h, 0, "GIF89a") },
  webp: { mime: "image/webp",   family: "image", check: (h) => riff(h, "WEBP") },
  avif: { mime: "image/avif",   family: "image", check: (h) => ftyp(h, ["avif", "avis"]) },
  heic: { mime: "image/heic",   family: "image", check: (h) => ftyp(h, ["heic", "heix", "hevc", "mif1", "msf1"]) },
  heif: { mime: "image/heif",   family: "image", check: (h) => ftyp(h, ["heic", "heix", "mif1", "msf1"]) },
  bmp:  { mime: "image/bmp",    family: "image", check: (h) => ascii(h, 0, "BM") },
  tif:  { mime: "image/tiff",   family: "image", check: (h) => at(h, 0, 0x49, 0x49, 0x2a, 0x00) || at(h, 0, 0x4d, 0x4d, 0x00, 0x2a) },
  tiff: { mime: "image/tiff",   family: "image", check: (h) => at(h, 0, 0x49, 0x49, 0x2a, 0x00) || at(h, 0, 0x4d, 0x4d, 0x00, 0x2a) },

  // video
  mp4:  { mime: "video/mp4",       family: "video", check: (h) => ftyp(h, ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V "]) },
  m4v:  { mime: "video/x-m4v",     family: "video", check: (h) => ftyp(h, ["M4V ", "M4VP", "isom", "mp42"]) },
  mov:  { mime: "video/quicktime", family: "video", check: (h) => ftyp(h, ["qt  ", "moov", "isom"]) || ascii(h, 4, "moov") },
  webm: { mime: "video/webm",      family: "video", check: (h) => at(h, 0, 0x1a, 0x45, 0xdf, 0xa3) },
  mkv:  { mime: "video/x-matroska",family: "video", check: (h) => at(h, 0, 0x1a, 0x45, 0xdf, 0xa3) },
  avi:  { mime: "video/x-msvideo", family: "video", check: (h) => riff(h, "AVI ") },
  "3gp":{ mime: "video/3gpp",      family: "video", check: (h) => ftyp(h, ["3gp4", "3gp5", "3gp6", "3gg6", "3g2a"]) },

  // audio
  mp3:  { mime: "audio/mpeg",  family: "audio", check: (h) => ascii(h, 0, "ID3") || (h.length > 1 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  m4a:  { mime: "audio/mp4",   family: "audio", check: (h) => ftyp(h, ["M4A ", "M4B ", "isom", "mp42"]) },
  aac:  { mime: "audio/aac",   family: "audio", check: (h) => ascii(h, 0, "ADIF") || (h.length > 1 && h[0] === 0xff && (h[1] & 0xf6) === 0xf0) },
  wav:  { mime: "audio/wav",   family: "audio", check: (h) => riff(h, "WAVE") },
  ogg:  { mime: "audio/ogg",   family: "audio", check: (h) => ascii(h, 0, "OggS") },
  oga:  { mime: "audio/ogg",   family: "audio", check: (h) => ascii(h, 0, "OggS") },
  opus: { mime: "audio/ogg",   family: "audio", check: (h) => ascii(h, 0, "OggS") },
  flac: { mime: "audio/flac",  family: "audio", check: (h) => ascii(h, 0, "fLaC") },
  amr:  { mime: "audio/amr",   family: "audio", check: (h) => ascii(h, 0, "#!AMR") },

  // documents (zip-based Office/ODF are inert here — we never unpack them)
  pdf:  { mime: "application/pdf", family: "document", check: (h) => ascii(h, 0, "%PDF-") },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   family: "document", check: zipped },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",         family: "document", check: zipped },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", family: "document", check: zipped },
  odt:  { mime: "application/vnd.oasis.opendocument.text",         family: "document", check: zipped },
  ods:  { mime: "application/vnd.oasis.opendocument.spreadsheet",  family: "document", check: zipped },
  odp:  { mime: "application/vnd.oasis.opendocument.presentation", family: "document", check: zipped },
  epub: { mime: "application/epub+zip", family: "document", check: zipped },

  // plain text
  txt:  { mime: "text/plain", family: "text", check: isText },
  md:   { mime: "text/plain", family: "text", check: isText },
  csv:  { mime: "text/plain", family: "text", check: isText },
  log:  { mime: "text/plain", family: "text", check: isText },
  json: { mime: "text/plain", family: "text", check: isText },
};

export const ACCEPTED_EXTENSIONS = Object.keys(ALLOWED).sort();

/**
 * Extensions rejected even as a NON-final segment, so `dump.sql.pdf` and
 * `payload.exe.jpg` are turned away rather than quietly stored under a
 * harmless-looking name. The allowlist above already blocks these as the final
 * extension; this closes the disguised-name case the owner called out.
 */
const FORBIDDEN_ANYWHERE = new Set([
  "sql", "db", "sqlite", "sqlite3", "mdb", "dump", "bak", "backup",
  "exe", "dll", "so", "msi", "apk", "deb", "rpm", "dmg", "iso", "jar", "class",
  "bat", "cmd", "com", "scr", "ps1", "sh", "bash", "zsh", "py", "rb", "pl",
  "php", "phtml", "jsp", "asp", "aspx", "cgi", "wsf", "vbs", "vbe", "hta",
  "js", "mjs", "cjs", "ts", "html", "htm", "xhtml", "svg", "xml", "shtml",
  "docm", "xlsm", "pptm", "dotm", "xlam", "lnk", "url", "desktop", "reg", "inf",
  "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz",
]);

// ─── Filename handling ───────────────────────────────────────────────────────

/**
 * Reduce a client-supplied name to something safe to store as text and show in
 * the dashboard. The result is never used as a filesystem path — see the
 * storage key — this is purely to keep the display value sane.
 */
export function sanitizeFilename(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const base = s.split(/[/\\]/).pop() ?? ""; // strip any directory component
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "") // control chars
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "") // bidi overrides (RTL spoofing)
    .replace(/^\.+/, "") // no leading dots — no hidden files
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

/** Final extension, lowercased, without the dot. */
export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export interface Rejection {
  filename: string;
  reason: "type" | "size" | "empty" | "content" | "name";
}

/** Validate a declared file BEFORE any bytes are accepted. */
export function checkDeclaredFile(
  rawName: unknown,
  rawSize: unknown,
): { ok: true; name: string; ext: string; rule: TypeRule; max: number } | { ok: false; reason: Rejection["reason"]; name: string } {
  const name = sanitizeFilename(rawName);

  // Any dangerous token anywhere in the dotted name is disqualifying.
  const segments = name.toLowerCase().split(".").slice(1);
  if (segments.some((seg) => FORBIDDEN_ANYWHERE.has(seg))) {
    return { ok: false, reason: "name", name };
  }

  const ext = extensionOf(name);
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, reason: "type", name };

  const size = typeof rawSize === "number" && Number.isFinite(rawSize) ? Math.floor(rawSize) : -1;
  if (size <= 0) return { ok: false, reason: "empty", name };

  const max = FAMILY_MAX_BYTES[rule.family];
  if (size > max) return { ok: false, reason: "size", name };

  return { ok: true, name, ext, rule, max };
}

export function familyMaxBytes(family: Family): number {
  return FAMILY_MAX_BYTES[family];
}

// ─── In-flight upload sessions ───────────────────────────────────────────────
//
// Held in memory: the app runs as a single `node server.js` process, sessions
// live minutes, and losing them on restart only costs an in-progress upload.

interface PendingFile {
  id: string;
  /** Position in the client's declared list, so it can match up the response. */
  declaredIndex: number;
  name: string;
  ext: string;
  declaredSize: number;
  rule: TypeRule;
  tmpPath: string;
  received: number;
  head: Buffer;
  hash: ReturnType<typeof createHash>;
  sawNul: boolean;
  complete: boolean;
  storageKey?: string;
  sha256?: string;
}

interface Session {
  id: string;
  token: string;
  ip: string;
  createdAt: number;
  files: Map<string, PendingFile>;
  committed: boolean;
}

const sessions = new Map<string, Session>();

/** Drop sessions past their TTL and delete whatever partial bytes they left. */
async function sweepSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.createdAt >= cutoff) continue;
    sessions.delete(id);
    for (const f of s.files.values()) {
      await rm(f.tmpPath, { force: true }).catch(() => {});
    }
  }
}

export interface DeclaredFile {
  name: unknown;
  size: unknown;
}

export interface InitResult {
  sessionId: string;
  token: string;
  files: { id: string; name: string; size: number; index: number }[];
  rejected: Rejection[];
}

export async function createSession(
  ip: string,
  declared: DeclaredFile[],
): Promise<{ ok: true; result: InitResult } | { ok: false; error: string }> {
  await sweepSessions();

  if (!Array.isArray(declared) || declared.length === 0) {
    return { ok: false, error: "no_files" };
  }
  if (declared.length > MAX_FILES_PER_SUBMISSION) {
    return { ok: false, error: "too_many_files" };
  }

  const accepted: PendingFile[] = [];
  const rejected: Rejection[] = [];
  let total = 0;

  for (const [index, d] of declared.entries()) {
    const check = checkDeclaredFile(d?.name, d?.size);
    if (!check.ok) {
      rejected.push({ filename: check.name, reason: check.reason });
      continue;
    }
    total += d.size as number;
    accepted.push({
      id: randomBytes(12).toString("hex"),
      declaredIndex: index,
      name: check.name,
      ext: check.ext,
      declaredSize: d.size as number,
      rule: check.rule,
      tmpPath: "", // assigned below, once the tmp dir exists
      received: 0,
      head: Buffer.alloc(0),
      hash: createHash("sha256"),
      sawNul: false,
      complete: false,
    });
  }

  if (accepted.length === 0) {
    return { ok: false, error: rejected.length ? "all_rejected" : "no_files" };
  }
  if (total > MAX_SUBMISSION_BYTES) return { ok: false, error: "submission_too_large" };

  const quota = await checkQuota(ip, total, accepted.length);
  if (!quota.ok) return { ok: false, error: quota.error };

  await mkdir(TMP_DIR, { recursive: true, mode: 0o700 });
  const id = randomBytes(16).toString("hex");
  for (const f of accepted) f.tmpPath = `${TMP_DIR}/${id}_${f.id}`;

  const session: Session = {
    id,
    token: randomBytes(24).toString("hex"),
    ip,
    createdAt: Date.now(),
    files: new Map(accepted.map((f) => [f.id, f])),
    committed: false,
  };
  sessions.set(id, session);

  return {
    ok: true,
    result: {
      sessionId: id,
      token: session.token,
      files: accepted.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.declaredSize,
        index: f.declaredIndex,
      })),
      rejected,
    },
  };
}

/** Constant-time token comparison, so the session token can't be probed. */
function tokenMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getSessionFile(
  sessionId: unknown,
  token: unknown,
  fileId: unknown,
): { session: Session; file: PendingFile } | null {
  if (typeof sessionId !== "string" || typeof token !== "string" || typeof fileId !== "string") return null;
  const session = sessions.get(sessionId);
  if (!session || session.committed) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) return null;
  if (!tokenMatches(session.token, token)) return null;
  const file = session.files.get(fileId);
  if (!file) return null;
  return { session, file };
}

/**
 * Append one chunk to a pending file. Bytes are streamed to disk as they
 * arrive, so a 250 MB video never sits in memory.
 */
export async function appendChunk(
  file: PendingFile,
  body: ReadableStream<Uint8Array> | null,
): Promise<{ ok: true; received: number; complete: boolean } | { ok: false; error: string }> {
  if (file.complete) return { ok: false, error: "already_complete" };
  if (!body) return { ok: false, error: "empty_chunk" };

  const max = familyMaxBytes(file.rule.family);
  const out = createWriteStream(file.tmpPath, { flags: "a", mode: 0o600 });
  const reader = body.getReader();
  let chunkBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const buf = Buffer.from(value);
      chunkBytes += buf.length;

      // Enforce both the single-chunk ceiling and the declared total. Either
      // being exceeded means the client is lying — abandon the file.
      if (chunkBytes > MAX_CHUNK_BYTES || file.received + chunkBytes > file.declaredSize || file.received + chunkBytes > max) {
        await reader.cancel().catch(() => {});
        out.destroy();
        await rm(file.tmpPath, { force: true }).catch(() => {});
        file.complete = true;
        return { ok: false, error: "size_exceeded" };
      }

      if (file.head.length < 64) {
        file.head = Buffer.concat([file.head, buf.subarray(0, 64 - file.head.length)]);
      }
      if (file.rule.family === "text" && buf.includes(0)) file.sawNul = true;
      file.hash.update(buf);

      if (!out.write(buf)) {
        await new Promise<void>((res, rej) => {
          out.once("drain", res);
          out.once("error", rej);
        });
      }
    }
  } catch {
    out.destroy();
    return { ok: false, error: "write_failed" };
  }

  await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
  file.received += chunkBytes;
  const complete = file.received === file.declaredSize;
  if (complete) file.complete = true;
  return { ok: true, received: file.received, complete };
}

/**
 * Final gate for one finished file: the bytes on disk must actually be the
 * format the extension promised. Runs before the file is moved into the store.
 */
export function verifyContent(file: PendingFile): boolean {
  if (file.received !== file.declaredSize || file.received === 0) return false;
  if (file.rule.family === "text" && file.sawNul) return false;
  return file.rule.check(file.head);
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export interface StoredFile {
  filename: string;
  storageKey: string;
  mime: string;
  size: number;
  sha256: string;
}

/**
 * Verify every finished file and move it into the permanent store under an
 * opaque, extension-less key. Anything that fails verification is deleted.
 */
export async function finalizeSession(
  sessionId: string,
  token: string,
): Promise<{ ok: true; stored: StoredFile[]; rejected: Rejection[]; ip: string } | { ok: false; error: string }> {
  const session = sessions.get(sessionId);
  if (!session || session.committed) return { ok: false, error: "unknown_session" };
  if (!tokenMatches(session.token, token)) return { ok: false, error: "unknown_session" };
  session.committed = true;
  sessions.delete(sessionId);

  const now = new Date();
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const stored: StoredFile[] = [];
  const rejected: Rejection[] = [];

  for (const file of session.files.values()) {
    if (!file.complete || !verifyContent(file)) {
      await rm(file.tmpPath, { force: true }).catch(() => {});
      rejected.push({ filename: file.name, reason: file.complete ? "content" : "empty" });
      continue;
    }
    // Opaque key: no client input reaches the path, and no extension lands on disk.
    const key = `${prefix}/${randomBytes(16).toString("hex")}`;
    const dest = safeStoragePath(key);
    await mkdir(`${UPLOAD_DIR}/${prefix}`, { recursive: true, mode: 0o700 });
    await rename(file.tmpPath, dest).catch(async (e) => {
      await rm(file.tmpPath, { force: true }).catch(() => {});
      throw e;
    });
    stored.push({
      filename: file.name,
      storageKey: key,
      mime: file.rule.mime,
      size: file.received,
      sha256: file.hash.digest("hex"),
    });
  }

  if (stored.length === 0) return { ok: false, error: "all_rejected" };
  return { ok: true, stored, rejected, ip: session.ip };
}

/**
 * Turn a storage key into an absolute path.
 *
 * The single guard is the format check: `YYYY/MM/<32 lowercase hex>` admits no
 * `..`, no separator other than the two it specifies, no absolute path and no
 * backslash, so the result cannot escape UPLOAD_DIR. Keys are server-generated
 * today; this stays strict so a future caller can't pass user input through.
 */
export function safeStoragePath(key: string): string {
  if (!/^\d{4}\/\d{2}\/[0-9a-f]{32}$/.test(key)) throw new Error("bad storage key");
  return `${UPLOAD_DIR}/${key}`;
}

// ─── Quotas ──────────────────────────────────────────────────────────────────

async function dirSizeBytes(): Promise<number> {
  const rows = await query<{ total: string | null }>(
    `SELECT COALESCE(SUM(size_bytes), 0)::text AS total FROM inbox_attachments`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function checkQuota(
  ip: string,
  incomingBytes: number,
  incomingFiles: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Sweep the ledger so it can't grow without bound.
  await query(`DELETE FROM upload_quota WHERE created_at < now() - INTERVAL '24 hours'`);

  const rows = await query<{ bytes: string | null; files: string }>(
    `SELECT COALESCE(SUM(bytes), 0)::text AS bytes, COUNT(*)::text AS files
       FROM upload_quota WHERE ip = $1 AND created_at > now() - INTERVAL '24 hours'`,
    [ip],
  );
  const usedBytes = Number(rows[0]?.bytes ?? 0);
  const usedFiles = Number(rows[0]?.files ?? 0);

  if (usedBytes + incomingBytes > QUOTA_BYTES_PER_IP) return { ok: false, error: "quota_bytes" };
  if (usedFiles + incomingFiles > QUOTA_FILES_PER_IP) return { ok: false, error: "quota_files" };

  if ((await dirSizeBytes()) + incomingBytes > GLOBAL_STORE_LIMIT_BYTES) {
    return { ok: false, error: "store_full" };
  }
  return { ok: true };
}

/** Record accepted bytes against the IP's rolling quota. */
export async function recordQuota(ip: string, files: StoredFile[]) {
  for (const f of files) {
    await query(`INSERT INTO upload_quota (ip, bytes) VALUES ($1, $2)`, [ip, f.size]);
  }
}

// ─── Signed download links ───────────────────────────────────────────────────
//
// The dashboard's own fetches carry the session cookie, but Telegram's native
// `downloadFile` hands the URL to the OS downloader, which runs outside the web
// view and has no cookie. So an attachment can also be fetched with a
// short-lived signature bound to that one file id — unguessable, single-file,
// and self-expiring, rather than opening the endpoint up.

/** How long a signed link stays valid. Long enough to browse, short enough to leak harmlessly. */
export const DOWNLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function downloadSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET environment variable is required (see .env.example)");
  return s;
}

export function signDownload(id: number | string, expMs: number): string {
  return createHmac("sha256", downloadSecret()).update(`attachment:${id}:${expMs}`).digest("hex");
}

/** Mint `{ exp, sig }` for one attachment id. */
export function mintDownloadToken(id: number | string): { exp: number; sig: string } {
  const exp = Date.now() + DOWNLOAD_TOKEN_TTL_MS;
  return { exp, sig: signDownload(id, exp) };
}

export function verifyDownloadToken(id: string, exp: unknown, sig: unknown): boolean {
  if (typeof sig !== "string" || !sig) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return false;
  const expected = Buffer.from(signDownload(id, expMs));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Remove a stored file from disk (used when its inbox message is deleted). */
export async function deleteStoredFile(key: string) {
  try {
    await rm(safeStoragePath(key), { force: true });
  } catch {
    /* already gone, or an unparseable key — nothing to do */
  }
}

/** Size on disk, or null if the file has vanished. */
export async function storedFileSize(key: string): Promise<number | null> {
  try {
    return (await stat(safeStoragePath(key))).size;
  } catch {
    return null;
  }
}
