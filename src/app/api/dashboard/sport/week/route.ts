import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { getWeekPlan, setWeekBlock, planForWeekday, BLOCKS, type Block } from "@/lib/sport";

export const dynamic = "force-dynamic";
const isBlock = (v: unknown): v is Block => BLOCKS.includes(v as Block);

/** Which blocks run on which weekday — the training routine, not a calendar. */
export async function GET(req: Request) {
  try {
    await requireOwner();
    const wd = Number(new URL(req.url).searchParams.get("weekday"));
    if (Number.isInteger(wd) && wd >= 1 && wd <= 7) {
      return Response.json(await planForWeekday(wd));
    }
    return Response.json(await getWeekPlan());
  } catch { return UNAUTHORIZED(); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const wd = Number(b?.weekday);
    if (!Number.isInteger(wd) || wd < 1 || wd > 7) {
      return Response.json({ error: "weekday 1..7 required" }, { status: 400 });
    }
    if (!isBlock(b?.block)) return Response.json({ error: "bad block" }, { status: 400 });
    await setWeekBlock(wd, b.block, b?.on !== false);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("sport/week:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
