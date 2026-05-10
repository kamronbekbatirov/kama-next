import { Resend } from "resend";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= MAX_PER_WINDOW) return false;
  e.count += 1;
  return true;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(ip)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let name = "", email = "", message = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.slice(0, 200) : "";
    email = typeof body?.email === "string" ? body.email.slice(0, 200) : "";
    message = typeof body?.message === "string" ? body.message.slice(0, 5000) : "";
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  if (!name || !email || !message) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!EMAIL_RX.test(email)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
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
