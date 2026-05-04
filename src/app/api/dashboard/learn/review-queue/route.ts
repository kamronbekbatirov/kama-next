import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await auth();
    const rows = await query(
      `SELECT n.*, s.title AS subject_title, s.emoji AS subject_emoji
       FROM learn_nodes n
       JOIN learn_subjects s ON s.id = n.subject_id
       WHERE n.next_review IS NOT NULL AND n.next_review <= NOW()
       ORDER BY n.next_review ASC
       LIMIT 50`
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
