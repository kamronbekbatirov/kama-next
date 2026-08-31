import type Anthropic from "@anthropic-ai/sdk";
import {
  listExercises, upsertExercise, deleteExercise, pauseExercise,
  getWorkoutForDay, startWorkout, addSet, personalBests,
  listMeasurements, saveMeasurement, BLOCKS, type Block,
} from "@/lib/sport";
import { isoToday } from "@/lib/timezone";

/**
 * Sport tools — owner only.
 *
 * A paused exercise is never quietly resumed: the pause exists because a
 * movement caused numbness, and the assistant is told to say the reason rather
 * than treating it as an ordinary skipped item.
 */
export const SPORT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "sport_program",
    description:
      "His training programme, grouped into blocks: warmup, main (gym), home, posture, cardio, stretch. Paused movements come back with the reason they are on hold — never suggest doing one without repeating that reason.",
    input_schema: {
      type: "object",
      properties: { block: { type: "string", enum: BLOCKS } },
    },
  },
  {
    name: "save_exercise",
    description: "Add an exercise to a block, or update one by id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Omit to create." },
        block: { type: "string", enum: BLOCKS },
        name: { type: "string" },
        sets: { type: "string", description: "Free text: '4' or '2-3'." },
        reps: { type: "string", description: "Free text: '10-12' or '30-45 sec'." },
        note: { type: "string", description: "Technique cue." },
      },
      required: ["block", "name"],
    },
  },
  {
    name: "pause_exercise",
    description:
      "Put a movement on hold with a reason, or take it off hold. Use this rather than deleting when something hurts — the programme should show why it is not being done.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        paused: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["id", "paused"],
    },
  },
  {
    name: "delete_exercise",
    description: "Remove an exercise from the programme entirely.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "log_workout_set",
    description:
      "Record a set. Starts today's session automatically if there is not one. Give weight_kg and reps for lifts, seconds for holds like planks.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        reps: { type: "integer" },
        weight_kg: { type: "number" },
        seconds: { type: "integer" },
        kind: { type: "string", enum: ["gym", "home", "cardio", "other"], description: "Only used when starting the session." },
        day: { type: "string", description: "ISO date. Default today." },
      },
      required: ["name"],
    },
  },
  {
    name: "sport_day",
    description: "What was trained on a day.",
    input_schema: {
      type: "object",
      properties: { day: { type: "string", description: "ISO date. Default today." } },
    },
  },
  {
    name: "sport_bests",
    description: "The heaviest or longest set recorded for each movement, and when — this is what progression looks like for this programme.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_weight",
    description: "Record a body measurement. Height carries forward and only needs giving when it changes.",
    input_schema: {
      type: "object",
      properties: {
        weight_kg: { type: "number" },
        height_cm: { type: "integer" },
        day: { type: "string", description: "ISO date. Default today." },
        note: { type: "string" },
      },
    },
  },
  {
    name: "body_history",
    description: "Weight over time, newest first.",
    input_schema: { type: "object", properties: {} },
  },
];

export const SPORT_TOOL_NAMES = new Set(SPORT_TOOL_DEFINITIONS.map(t => t.name));

type Input = Record<string, unknown>;
const asStr = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const asInt = (v: unknown) => {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
};
const asNum = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;
const fmt = (s: { weight_kg?: number | null; reps?: number | null; seconds?: number | null }) =>
  s.weight_kg ? `${s.weight_kg}kg × ${s.reps ?? "?"}` : s.seconds ? `${s.seconds}s` : String(s.reps ?? "—");

export async function executeSportTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "sport_program": {
      const block = BLOCKS.includes(input.block as Block) ? input.block as Block : undefined;
      const rows = await listExercises(block);
      if (rows.length === 0) return "No exercises in the programme.";
      return rows.map(e =>
        `#${e.id} [${e.block}] ${e.name}` +
        (e.sets || e.reps ? ` — ${e.sets ?? ""}${e.sets && e.reps ? " × " : ""}${e.reps ?? ""}` : "") +
        (e.note ? ` (${e.note})` : "") +
        (e.paused ? `  ON HOLD: ${e.paused_reason ?? "no reason recorded"}` : "")
      ).join("\n");
    }

    case "save_exercise": {
      const block = input.block as Block;
      if (!BLOCKS.includes(block)) return `Error: block must be one of ${BLOCKS.join(", ")}`;
      const ex = await upsertExercise({
        id: asInt(input.id) ?? undefined, block, name: String(input.name ?? ""),
        sets: asStr(input.sets), reps: asStr(input.reps), note: asStr(input.note),
      });
      return ex ? `Saved #${ex.id}: ${ex.name} in ${ex.block}.` : "Error: name required";
    }

    case "pause_exercise": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const paused = !!input.paused;
      const ex = await pauseExercise(id, paused, asStr(input.reason));
      if (!ex) return `Error: no exercise #${id}`;
      return paused
        ? `"${ex.name}" is on hold: ${ex.paused_reason ?? "no reason recorded"}`
        : `"${ex.name}" is back in the programme.`;
    }

    case "delete_exercise": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      return (await deleteExercise(id)) ? `Exercise #${id} removed.` : `Error: no exercise #${id}`;
    }

    case "log_workout_set": {
      const n = asStr(input.name);
      if (!n) return "Error: name required";
      const day = asStr(input.day) ?? await isoToday();
      let wo = await getWorkoutForDay(day);
      if (!wo) {
        const id = await startWorkout(day, asStr(input.kind) ?? "gym");
        if (!id) return "Error: could not start the session";
        wo = await getWorkoutForDay(day);
      }
      if (!wo) return "Error: could not start the session";
      const set = await addSet(wo.id, {
        name: n, reps: asInt(input.reps), weight: asNum(input.weight_kg), seconds: asInt(input.seconds),
      });
      return set ? `Logged ${n}: ${fmt(set)} (set ${set.set_no}).` : "Error: could not log";
    }

    case "sport_day": {
      const day = asStr(input.day) ?? await isoToday();
      const wo = await getWorkoutForDay(day);
      if (!wo) return `${day}: nothing trained.`;
      const lines = wo.sets.map(s => `  ${s.set_no}. ${s.name} — ${fmt(s)}`);
      return `${day} (${wo.kind}):\n${lines.join("\n") || "  (no sets)"}`;
    }

    case "sport_bests": {
      const rows = await personalBests();
      if (rows.length === 0) return "Nothing logged yet.";
      return rows.map(b => `${b.name}: ${fmt(b)} on ${b.day}`).join("\n");
    }

    case "log_weight": {
      const day = asStr(input.day) ?? await isoToday();
      const row = await saveMeasurement({
        day, weight: asNum(input.weight_kg), height: asInt(input.height_cm), note: asStr(input.note),
      });
      return row ? `${row.day}: ${row.weight_kg ?? "?"} kg${row.height_cm ? `, ${row.height_cm} cm` : ""}.` : "Error";
    }

    case "body_history": {
      const rows = await listMeasurements(20);
      if (rows.length === 0) return "No measurements recorded.";
      return rows.map(m => `${m.day}: ${m.weight_kg ?? "?"} kg`).join("\n");
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
