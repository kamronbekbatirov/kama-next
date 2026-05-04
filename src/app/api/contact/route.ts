import { Resend } from "resend";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(req: Request) {
  const { name, email, message } = await req.json();

  if (!name || !email || !message) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "hi@kama.uz",
    to: "hi@kama.uz",
    replyTo: email,
    subject: `New message from ${esc(name)}`,
    html: `
      <p><strong>Name:</strong> ${esc(name)}</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${esc(message)}</p>
    `,
  });

  if (error) {
    return Response.json({ error }, { status: 500 });
  }

  return Response.json({ success: true });
}
