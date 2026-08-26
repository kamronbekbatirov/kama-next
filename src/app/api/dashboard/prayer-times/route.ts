import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { prayersForDay, getPrayerConfig, savePrayerConfig } from "@/lib/prayer-times";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Prayer times for a day, plus the settings they were computed from. */
export async function GET(req: Request) {
  try {
    await requireOwner();
    const p = new URL(req.url).searchParams;
    const date = ISO_DATE.test(p.get("date") ?? "") ? p.get("date")! : await isoToday();
    const [day, config] = await Promise.all([prayersForDay(date), getPrayerConfig()]);
    return Response.json({ ...day, config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("prayer-times:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof b.lat === "number" && typeof b.lon === "number") {
      if (Math.abs(b.lat) > 90 || Math.abs(b.lon) > 180) {
        return Response.json({ error: "coordinates out of range" }, { status: 400 });
      }
      // Coordinates are stamped with the zone they were entered for; if the
      // dashboard later moves, they are replaced rather than silently reused.
      patch.lat = b.lat; patch.lon = b.lon; patch.coordsTz = b.coordsTz;
    }
    for (const k of ["fajrAngle", "ishaAngle"] as const) {
      if (typeof b[k] === "number" && b[k] > 0 && b[k] < 30) patch[k] = b[k];
    }
    if (b.madhab === "hanafi" || b.madhab === "shafi") patch.madhab = b.madhab;
    if (b.adjust && typeof b.adjust === "object") patch.adjust = b.adjust;

    return Response.json(await savePrayerConfig(patch));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("prayer-times PATCH:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
