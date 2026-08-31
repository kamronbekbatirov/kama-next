import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { getDay, addEntry, removeEntry, dayTotal } from "@/lib/food";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("food/diary:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};

export async function GET(req: Request) {
  try {
    await requireOwner();
    const p = new URL(req.url).searchParams.get("day");
    const day = ISO.test(p ?? "") ? p! : await isoToday();
    const [entries, total] = await Promise.all([getDay(day), dayTotal(day)]);
    return Response.json({ day, entries, total });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const day = ISO.test(String(b?.day)) ? String(b.day) : await isoToday();
    const num = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null;
    const entry = await addEntry({
      day, name: String(b?.name ?? ""), slot: b?.slot ?? null,
      kcal: num(b?.kcal), kcal_max: num(b?.kcal_max),
      source: b?.source, dishId: Number.isInteger(b?.dish_id) ? b.dish_id : null,
      note: b?.note ?? null,
    });
    if (!entry) return Response.json({ error: "name required" }, { status: 400 });
    return Response.json({ entry, total: await dayTotal(day) });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await removeEntry(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
