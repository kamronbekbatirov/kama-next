import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { listDishes, upsertDish, archiveDish, deleteDish } from "@/lib/food";

export const dynamic = "force-dynamic";

const guard = async () => { await requireOwner(); };
const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("food/dishes:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};

export async function GET(req: Request) {
  try {
    await guard();
    const all = new URL(req.url).searchParams.get("archived") === "1";
    return Response.json(await listDishes(all));
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await guard();
    const b = await req.json();
    const dish = await upsertDish(b);
    return dish ? Response.json(dish) : Response.json({ error: "name required" }, { status: 400 });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  try {
    await guard();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const dish = await upsertDish(b, id);
    return dish ? Response.json(dish) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await guard();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    // Archiving keeps a dish out of the book without erasing the meals that
    // referenced it; purge is the explicit ask, as with tracker goals.
    const ok = b?.purge === true ? await deleteDish(id) : await archiveDish(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
