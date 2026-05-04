import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (s?.authenticated) return Response.json({ ok: true });
  return Response.json({ ok: false }, { status: 401 });
}
