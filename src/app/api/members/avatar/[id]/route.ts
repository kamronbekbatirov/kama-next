import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { memberPhotoFileId } from "@/lib/members";
import { tgGetFileUrl } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * A member's Telegram profile photo, proxied.
 *
 * Proxied rather than linked because the direct file url embeds the bot token —
 * handing it to a browser would put it in devtools, referrers and history. The
 * response is deliberately private and short-lived: it is another person's
 * face, and it changes when they change it.
 *
 * Readable by any active member, since the whole point of the board is that the
 * group sees each other. Nobody outside the group gets past requireMember.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/members/avatar/[id]">) {
  try {
    await requireMember();
  } catch {
    return UNAUTHORIZED();
  }

  const { id } = await ctx.params;
  const fileId = await memberPhotoFileId(id);
  if (!fileId) return new Response(null, { status: 404 });

  const url = await tgGetFileUrl(fileId);
  if (!url) return new Response(null, { status: 404 });

  const upstream = await fetch(url).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response(null, { status: 404 });

  // Telegram's file CDN answers application/octet-stream. Paired with the
  // nosniff below that is a picture the browser refuses to draw, so the type is
  // asserted here — profile photos come back as JPEG.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  const type = upstreamType.startsWith("image/") ? upstreamType : "image/jpeg";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
