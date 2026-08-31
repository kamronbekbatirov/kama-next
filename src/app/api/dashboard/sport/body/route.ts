import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { listMeasurements, saveMeasurement, deleteMeasurement } from "@/lib/sport";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    await requireOwner();
    return Response.json(await listMeasurements());
  } catch { return UNAUTHORIZED(); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const day = ISO.test(String(b?.day)) ? String(b.day) : await isoToday();
    const n = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const row = await saveMeasurement({
      day, weight: n(b?.weight_kg), height: n(b?.height_cm), note: b?.note ?? null,
    });
    return Response.json(row ?? { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("sport/body:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/** Remove a weigh-in. A number typed wrong is the commonest thing to fix. */
export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const day = String(b?.day ?? "");
    if (!ISO.test(day)) return Response.json({ error: "day required" }, { status: 400 });
    const ok = await deleteMeasurement(day);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("sport/body DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
