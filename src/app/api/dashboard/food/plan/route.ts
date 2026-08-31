import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { getPlan, addToPlan, removeFromPlan } from "@/lib/food";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("food/plan:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};

export async function GET(req: Request) {
  try {
    await requireOwner();
    const p = new URL(req.url).searchParams;
    const today = await isoToday();
    const from = ISO.test(p.get("from") ?? "") ? p.get("from")! : today;
    const to = ISO.test(p.get("to") ?? "") ? p.get("to")! : from;
    return Response.json(await getPlan(from, to));
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const day = ISO.test(String(b?.day)) ? String(b.day) : await isoToday();
    const slot = SLOTS.has(String(b?.slot)) ? String(b.slot) : null;
    if (!slot) return Response.json({ error: "slot required" }, { status: 400 });
    const dishId = Number.isInteger(b?.dish_id) ? Number(b.dish_id) : null;
    if (!dishId && !b?.note) return Response.json({ error: "dish_id or note required" }, { status: 400 });
    const row = await addToPlan(day, slot, dishId, b?.note ?? null);
    return Response.json(row ?? { ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await removeFromPlan(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
