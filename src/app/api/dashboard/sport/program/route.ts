import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { listExercises, upsertExercise, deleteExercise, pauseExercise, BLOCKS, type Block } from "@/lib/sport";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("sport/program:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};
const isBlock = (v: unknown): v is Block => BLOCKS.includes(v as Block);

export async function GET(req: Request) {
  try {
    await requireOwner();
    const b = new URL(req.url).searchParams.get("block");
    return Response.json(await listExercises(isBlock(b) ? b : undefined));
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    if (!isBlock(b?.block)) return Response.json({ error: "bad block" }, { status: 400 });
    const ex = await upsertExercise(b);
    return ex ? Response.json(ex) : Response.json({ error: "name required" }, { status: 400 });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });

    // Pausing is its own branch: it carries a reason and must not require
    // resending the whole exercise.
    if ("paused" in b && !("name" in b)) {
      const ex = await pauseExercise(id, !!b.paused, b.paused_reason);
      return ex ? Response.json(ex) : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!isBlock(b?.block)) return Response.json({ error: "bad block" }, { status: 400 });
    const ex = await upsertExercise({ ...b, id });
    return ex ? Response.json(ex) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await deleteExercise(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
