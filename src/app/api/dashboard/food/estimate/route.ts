import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { anthropic } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Estimate calories from a photo — and only estimate. Nothing is written here.
 *
 * The result goes back to the caller for confirmation, because a photo shows
 * what is on the plate and not what went into the pan: no oil, no butter, no
 * portion weight. Answering with one number would dress a guess up as a
 * measurement, so the model is asked for a range and the range is what gets
 * stored.
 */
const SYSTEM = `You estimate the calorie content of a meal from a photograph.

Answer with JSON only, no prose, in this exact shape:
{"name": "<short dish name in the user's language>", "kcal_min": <int>, "kcal_max": <int>, "note": "<one short sentence: what you assumed>"}

Rules:
- Always give a range. A photograph cannot show oil, butter, or portion weight,
  and a single number would claim precision you do not have.
- The range should be honest, not wide for safety: if you can see it is a small
  plate of rice, 250-350 is useful and 100-900 is not.
- If the photo does not show food, set kcal_min and kcal_max to 0 and say so in
  the note.
- The note says what you assumed — portion size, cooking method — because that
  is what the person needs in order to correct you.`;

export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch { return UNAUTHORIZED(); }

  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return Response.json({ error: "image required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "too_large" }, { status: 413 });
    }
    const type = file.type || "image/jpeg";
    if (!TYPES.has(type)) {
      return Response.json({ error: "unsupported_type" }, { status: 415 });
    }

    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const hint = String(form.get("hint") ?? "").trim().slice(0, 300);

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: type as "image/jpeg", data: b64 } },
          { type: "text", text: hint ? `Extra detail from the person: ${hint}` : "Estimate this meal." },
        ],
      }],
    });

    const text = res.content
      .filter((b): b is { type: "text"; text: string; citations: null } => b.type === "text")
      .map(b => b.text).join("").trim();

    // The model was told to answer with JSON only, but a stray sentence around
    // it must not turn a good estimate into a 500.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ error: "unreadable", raw: text.slice(0, 300) }, { status: 502 });

    const parsed = JSON.parse(match[0]) as {
      name?: string; kcal_min?: number; kcal_max?: number; note?: string;
    };
    const lo = Math.max(0, Math.round(Number(parsed.kcal_min ?? 0)));
    const hi = Math.max(lo, Math.round(Number(parsed.kcal_max ?? lo)));

    return Response.json({
      name: String(parsed.name ?? "").slice(0, 200) || "—",
      kcal: lo,
      kcal_max: hi,
      note: String(parsed.note ?? "").slice(0, 400),
    });
  } catch (e) {
    console.error("food/estimate:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "error" }, { status: 500 });
  }
}
