import { appendChunk, getSessionFile } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Step 2: raw bytes, one slice at a time.
 *
 * The body is a plain binary stream (no multipart), piped straight to a temp
 * file as it arrives — a 250 MB video is never held in memory. The session id +
 * token identify which pending file the bytes belong to; the library enforces
 * the declared size so a client can't stream more than it promised.
 */
export async function POST(req: Request) {
  const found = getSessionFile(
    req.headers.get("x-session-id"),
    req.headers.get("x-upload-token"),
    req.headers.get("x-file-id"),
  );
  if (!found) return Response.json({ error: "unknown_session" }, { status: 403 });

  const result = await appendChunk(found.file, req.body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  return Response.json({ received: result.received, complete: result.complete });
}
