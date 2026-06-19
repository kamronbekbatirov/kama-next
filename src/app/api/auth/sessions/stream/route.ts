import { getSession, getCurrentSid } from "@/lib/auth";
import { onRevoke } from "@/lib/session-events";

export const dynamic = "force-dynamic";

// Server-Sent Events stream the dashboard subscribes to. When this session is
// revoked (from another device or via Telegram) the server pushes a `revoked`
// event and the client drops to login immediately — no reload, no polling lag.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s?.authenticated) return new Response("unauthorized", { status: 401 });
  const sid = await getCurrentSid();
  if (!sid) return new Response("untracked", { status: 409 }); // legacy cookie → client falls back to polling

  const encoder = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ }
      };
      const close = () => {
        if (ping) clearInterval(ping);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      };

      enqueue(`retry: 3000\nevent: ready\ndata: ${sid}\n\n`);

      unsub = onRevoke((e) => {
        if (e.ids.includes(sid)) {
          enqueue(`event: revoked\ndata: 1\n\n`);
          close();
        }
      });

      // Keep-alive comment so proxies (Caddy) don't drop the idle connection.
      ping = setInterval(() => enqueue(`: ping\n\n`), 20000);

      // Clean up when the client disconnects.
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
