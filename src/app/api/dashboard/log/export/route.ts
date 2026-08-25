import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { isoToday } from "@/lib/timezone";
import { mintScopedToken, verifyScopedToken } from "@/lib/uploads";
import { type Lang } from "@/lib/i18n";
import { fetchJournal, renderJournalMarkdown } from "@/lib/journal-export";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** RFC 5987 Content-Disposition with a hardened ASCII fallback. */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\w.\-+ ]/g, "_").slice(0, 100) || "journal.md";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Export journal entries for a date range as Markdown.
 *
 * Two modes:
 *   • `?link=1` (session only) mints a short-lived signed URL. Telegram's
 *     native `downloadFile` fetches outside the web view, where the session
 *     cookie does not apply — same reason inbox attachments carry a signature.
 *   • otherwise, streams the Markdown as an attachment. Accepts either the
 *     session cookie or that signature.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  const today = await isoToday();
  const rawTo = params.get("to");
  const rawFrom = params.get("from");
  const to = rawTo && ISO_DATE.test(rawTo) ? rawTo : today;
  const from = rawFrom && ISO_DATE.test(rawFrom) ? rawFrom : to;
  if (from > to) return Response.json({ error: "from must be <= to" }, { status: 400 });

  const scope = `log:${from}:${to}`;
  const signed = verifyScopedToken(scope, params.get("exp"), params.get("sig"));
  if (!signed) {
    try { await requireOwner(); } catch { return UNAUTHORIZED(); }
  }

  const filename = `journal-${from}_${to}.md`;

  // Mint mode: the caller has a session and wants a URL it can hand to the
  // Telegram downloader.
  if (params.get("link") === "1") {
    if (signed) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { exp, sig } = mintScopedToken(scope);
    const q = new URLSearchParams({ from, to, exp: String(exp), sig });
    const langParam = params.get("lang");
    if (langParam) q.set("lang", langParam);
    return Response.json({ url: `/api/dashboard/log/export?${q}`, filename });
  }

  const langParam = params.get("lang");
  const lang: Lang = langParam === "en" || langParam === "ru" || langParam === "uz" ? langParam : "ru";

  const rows = await fetchJournal(from, to);

  return new Response(renderJournalMarkdown(rows, from, to, lang), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": disposition(filename),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
