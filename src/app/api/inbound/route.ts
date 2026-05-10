import { Resend } from "resend";

const FORWARD_TO = "REDACTED";

export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = await req.json();

  // Resend sends: { type: "email.received", data: { email_id, from, to, subject, ... } }
  const data = payload?.data ?? payload;
  const emailId: string | undefined = data?.email_id;
  const from: string = data?.from || "unknown";
  const subject: string = data?.subject || "(no subject)";

  // Try to fetch full email body
  let html = "";
  if (emailId) {
    for (const path of [`/inbound/emails/${emailId}`, `/emails/${emailId}`]) {
      const r = await fetch(`https://api.resend.com${path}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (r.ok) {
        const email = await r.json();
        html = email.html || email.text?.replace(/\n/g, "<br>") || "";
        break;
      }
    }
  }

  const { error } = await resend.emails.send({
    from: "hi@kama.uz",
    to: FORWARD_TO,
    replyTo: from === "unknown" ? undefined : from,
    subject: `Fwd: ${subject}`,
    html: `
      <p style="color:#666;font-size:13px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">
        <strong>From:</strong> ${from}<br>
        <strong>Subject:</strong> ${subject}
        ${emailId ? `<br><strong>ID:</strong> ${emailId}` : ""}
      </p>
      ${html || "<p><em>Body not available — check Resend dashboard.</em></p>"}
    `,
  });

  if (error) {
    return Response.json({ ok: false, error }, { status: 500 });
  }

  return Response.json({ ok: true });
}
