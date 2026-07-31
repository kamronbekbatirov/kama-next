import { createReadStream } from "fs";
import { Readable } from "stream";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { safeStoragePath, storedFileSize, verifyDownloadToken } from "@/lib/uploads";

export const dynamic = "force-dynamic";

interface Row {
  filename: string;
  storage_key: string;
  mime: string;
  size_bytes: string;
}

/** Types safe to render inline in the dashboard. Everything else downloads. */
const INLINE_OK = /^(image\/(jpeg|png|gif|webp|avif|bmp)|video\/(mp4|webm|quicktime|x-m4v)|audio\/|application\/pdf$|text\/plain$)/;

/**
 * RFC 5987 Content-Disposition. The ASCII fallback is aggressively stripped so
 * a crafted filename can't inject header syntax (quotes, CR/LF, semicolons).
 */
function disposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\w.\-+ ]/g, "_").slice(0, 100) || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Owner-only read path for an uploaded file.
 *
 * The public /upload endpoint accepts bytes from strangers, so this side is
 * where we make sure those bytes can never act on anyone:
 *   • a valid dashboard session is required — nothing is publicly reachable;
 *   • the served Content-Type is the one the SERVER sniffed at upload time,
 *     never the uploader's claim;
 *   • `nosniff` stops the browser from re-interpreting it as something active;
 *   • a `default-src 'none'; sandbox` CSP neuters anything that does slip
 *     through a viewer;
 *   • anything not on the inline-safe list is forced to download.
 * Range requests are supported so video/audio can seek in the preview player.
 *
 * Two ways in: the dashboard session cookie, or a short-lived signature bound
 * to this one attachment id. The signature exists because Telegram's native
 * `downloadFile` fetches outside the web view, where the cookie doesn't apply.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/dashboard/inbox/attachment/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const params = new URL(req.url).searchParams;
  const signed = verifyDownloadToken(id, params.get("exp"), params.get("sig"));
  if (!signed) {
    const session = await getSession();
    if (!session?.authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await query<Row>(
    `SELECT filename, storage_key, mime, size_bytes::text FROM inbox_attachments WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return Response.json({ error: "not found" }, { status: 404 });
  const row = rows[0];

  let path: string;
  try {
    path = safeStoragePath(row.storage_key);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const size = await storedFileSize(row.storage_key);
  if (size === null) return Response.json({ error: "gone" }, { status: 410 });

  const inline = params.get("inline") === "1" && INLINE_OK.test(row.mime);

  const headers = new Headers({
    // Unknown/never-inline types go out as opaque bytes the browser won't touch.
    "Content-Type": inline ? row.mime : "application/octet-stream",
    "Content-Disposition": disposition(inline ? "inline" : "attachment", row.filename),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    // Telegram Web hands the download to a fetch from its own origin; without
    // this the Mini App `downloadFile` silently fails there (per the Mini Apps
    // docs). Only Telegram's own origin is allowed — not a wildcard.
    "Access-Control-Allow-Origin": "https://web.telegram.org",
    "Vary": "Origin",
  });

  // Partial content — lets the <video>/<audio> preview seek.
  const range = req.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: 200, headers });
}
