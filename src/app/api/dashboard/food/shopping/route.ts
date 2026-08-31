import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import {
  listShopping, addShopping, addDishToShopping,
  setShoppingChecked, removeShopping, clearCheckedShopping,
} from "@/lib/food";

export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("food/shopping:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};

export async function GET() {
  try {
    await requireOwner();
    return Response.json(await listShopping());
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    // Adding a whole dish is the point of the list — its ingredients go on in
    // one tap, skipping anything already there and unticked.
    if (Number.isInteger(b?.from_dish)) {
      const added = await addDishToShopping(Number(b.from_dish));
      return Response.json({ ok: true, added });
    }
    const row = await addShopping(String(b?.name ?? ""), b?.qty ?? null);
    return row ? Response.json(row) : Response.json({ error: "name required" }, { status: 400 });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await setShoppingChecked(id, !!b?.checked);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    if (b?.clear_checked === true) {
      return Response.json({ ok: true, removed: await clearCheckedShopping() });
    }
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await removeShopping(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
