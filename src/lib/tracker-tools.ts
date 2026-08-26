import type Anthropic from "@anthropic-ai/sdk";
import {
  listGoals, createGoal, updateGoal, archiveGoal, checkIn, removeCheckIn,
  getBoard, getWeek, goalCheckIns, validateGoal, setReminder,
  listSteps, addStep, setStepDone, removeStep, type NewGoal,
} from "@/lib/tracker";
import { isoDateIn } from "@/lib/timezone";

/**
 * The guest's tool set — a separate module with its own dispatcher and its own
 * `default` branch.
 *
 * This deliberately does NOT filter the owner's shared dispatcher by an
 * allow-list. With a filter, any tool added to the shared switch becomes
 * reachable the moment the list is wrong; with two dispatchers and no shared
 * fallthrough, a guest can only ever reach what is written here.
 *
 * Note also that `member_id` is not a parameter of any schema below — it is
 * supplied from the resolved session. The model cannot address another
 * member's rows even if it tries.
 */

export const TRACKER_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_my_goals",
    description:
      "List the goals this person is tracking, with their if-then plan, unit and target. Call it before checking in so you use the right goal id.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_goal",
    description:
      "Create a goal. Two things are required and cannot be guessed for them: something countable (a unit and a target number), and an if-then plan — the situation that triggers it and the action that follows. If they describe a vague goal like 'exercise more', ask what to count and when it will happen before calling this.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the goal is." },
        metric_unit: { type: "string", description: "What is counted: km, minutes, pages, times." },
        target_value: { type: "number", description: "How much counts as done, per period. Must be > 0." },
        period: { type: "string", enum: ["day", "week"], description: "Default 'day'." },
        cue_when: { type: "string", description: "The situation alone: 'after I put the kettle on'. No leading \"when\"/\"когда\" — it is rendered inside a sentence that already supplies one." },
        action_then: { type: "string", description: "The action that follows it." },
        woop_outcome: { type: "string", description: "Optional: what will be better once this is happening." },
        woop_obstacle: { type: "string", description: "Optional: the thing that usually gets in the way. Worth asking for — naming it honestly is the useful part." },
        stake: { type: "string", description: "Optional: what happens if they don't. Something small that the group will know about." },
      },
      required: ["title", "metric_unit", "target_value", "cue_when", "action_then"],
    },
  },
  {
    name: "check_in",
    description:
      "Record progress on a goal for a day. Defaults to today and to the goal's target value. Calling it twice for the same day corrects the number rather than adding to it.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        value: { type: "number", description: "How much was done. Defaults to the goal's target." },
        day: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
        note: { type: "string" },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "undo_check_in",
    description: "Remove a check-in for a day, if it was logged by mistake.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        day: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "set_reminder",
    description:
      "Set or clear a daily reminder for a goal. At that time the bot sends them their own if-then plan back. Pass remind_at as HH:MM in their local time, or null to turn it off.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        remind_at: { type: "string", description: "HH:MM local time, or omit/null to clear." },
        days: {
          type: "array",
          items: { type: "integer", minimum: 1, maximum: 7 },
          description: "ISO weekdays (1=Mon … 7=Sun). Omit for every day.",
        },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "update_goal",
    description:
      "Change an existing goal of theirs. Only the fields passed are touched. Use this rather than creating a second goal when someone wants to raise a target, reword their if-then plan, or add the obstacle and stake they skipped at first.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        title: { type: "string" },
        metric_unit: { type: "string" },
        target_value: { type: "number" },
        period: { type: "string", enum: ["day", "week"] },
        cue_when: { type: "string", description: "The situation alone, with no leading \"when\"/\"когда\"." },
        action_then: { type: "string" },
        woop_outcome: { type: "string" },
        woop_obstacle: { type: "string" },
        stake: { type: "string" },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "archive_goal",
    description:
      "Retire one of their goals. Its history is kept and it leaves the board. Use when someone says they are done with a goal or want to stop it — never as a reaction to missed days.",
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "integer" } },
      required: ["goal_id"],
    },
  },
  {
    name: "goal_history",
    description:
      "The days one of their goals was logged, within a date range. Use to answer 'how have I been doing' with the actual days rather than a guess.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        from: { type: "string", description: "ISO date YYYY-MM-DD. Default 30 days ago." },
        to: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "add_step",
    description:
      "Add a milestone to one of their goals. Steps are OPTIONAL and only for a goal with a destination — 'English to B2' has steps, 'read 20 pages a day' does not. Never break a daily habit into steps; the daily count already measures it.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        title: { type: "string", description: "One milestone, in their words." },
      },
      required: ["goal_id", "title"],
    },
  },
  {
    name: "complete_step",
    description: "Tick a step off, or untick it with done=false. This is not a check-in — a check-in is the daily behaviour, a step is distance covered.",
    input_schema: {
      type: "object",
      properties: {
        step_id: { type: "integer" },
        done: { type: "boolean", description: "Defaults to true." },
      },
      required: ["step_id"],
    },
  },
  {
    name: "list_steps",
    description: "The steps on one of their goals, with the ids needed to tick or remove them.",
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "integer" } },
      required: ["goal_id"],
    },
  },
  {
    name: "remove_step",
    description: "Delete a step from one of their goals.",
    input_schema: {
      type: "object",
      properties: { step_id: { type: "integer" } },
      required: ["step_id"],
    },
  },
  {
    name: "group_summary",
    description:
      "How everyone in the group is doing this week and over the last 30 days. This is the shared board — the whole point is that progress is visible to the others.",
    input_schema: { type: "object", properties: {} },
  },
];

interface Input { [k: string]: unknown }
const asStr = (v: unknown) => (typeof v === "string" ? v : null);
const asInt = (v: unknown) => {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? null : n;
};

export interface GuestContext {
  memberId: string;
  displayName: string;
  tz: string;
}

export async function executeTrackerTool(
  name: string, input: Input, ctx: GuestContext,
): Promise<string> {
  const today = isoDateIn(ctx.tz);

  switch (name) {
    case "list_my_goals": {
      const goals = await listGoals(ctx.memberId);
      if (goals.length === 0) return "No goals yet.";
      return goals.map(g => {
        const e = (g.extras ?? {}) as { woop_obstacle?: string; stake?: string };
        const extra = [
          e.woop_obstacle ? `Usual obstacle: ${e.woop_obstacle}` : null,
          e.stake ? `Stake: ${e.stake}` : null,
        ].filter(Boolean).join(". ");
        return `#${g.id} ${g.title} — ${g.target_value} ${g.metric_unit}/${g.period}. Plan: when ${g.cue_when}, then ${g.action_then}.${extra ? " " + extra : ""}`;
      }).join("\n");
    }

    case "create_goal": {
      const draft: Partial<NewGoal> = {
        title: asStr(input.title) ?? "",
        metricUnit: asStr(input.metric_unit) ?? "",
        targetValue: typeof input.target_value === "number" ? input.target_value : Number(input.target_value),
        period: input.period === "week" ? "week" : "day",
        cueWhen: asStr(input.cue_when) ?? "",
        actionThen: asStr(input.action_then) ?? "",
        startDate: today,
        extras: {
          woop_outcome: asStr(input.woop_outcome) ?? undefined,
          woop_obstacle: asStr(input.woop_obstacle) ?? undefined,
          stake: asStr(input.stake) ?? undefined,
        },
      };
      const bad = validateGoal(draft);
      if (bad) return `Error: ${bad}`;
      const g = await createGoal(ctx.memberId, draft as NewGoal);
      return `Created goal #${g.id}: ${g.title} — ${g.target_value} ${g.metric_unit} per ${g.period}.`;
    }

    case "check_in": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const goals = await listGoals(ctx.memberId);
      const goal = goals.find(g => g.id === goalId);
      if (!goal) return `Error: no goal #${goalId} of yours`;
      const day = asStr(input.day) ?? today;
      const value = typeof input.value === "number" ? input.value : goal.target_value;
      const ok = await checkIn(ctx.memberId, goalId, day, value, asStr(input.note), "bot");
      if (!ok) return `Error: no goal #${goalId} of yours`;
      return `Logged ${value} ${goal.metric_unit} on ${goal.title} for ${day}.`;
    }

    case "undo_check_in": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const day = asStr(input.day) ?? today;
      const ok = await removeCheckIn(ctx.memberId, goalId, day);
      return ok ? `Removed the check-in for ${day}.` : `Nothing logged on ${day} for goal #${goalId}.`;
    }

    case "set_reminder": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const at = asStr(input.remind_at);
      if (at !== null && !/^\d{2}:\d{2}$/.test(at)) return "Error: remind_at must be HH:MM";
      const days = Array.isArray(input.days)
        ? (input.days as unknown[]).map(d => asInt(d) ?? 0).filter(n => n >= 1 && n <= 7)
        : null;
      const ok = await setReminder(ctx.memberId, goalId, at, days && days.length ? days : null);
      if (!ok) return `Error: no goal #${goalId} of yours`;
      return at
        ? `Reminder set for ${at}${days && days.length ? ` on days ${days.join(",")}` : " every day"}.`
        : "Reminder turned off.";
    }

    case "update_goal": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const patch: Partial<NewGoal> = {};
      if (asStr(input.title)) patch.title = asStr(input.title)!;
      if (asStr(input.metric_unit)) patch.metricUnit = asStr(input.metric_unit)!;
      if (input.target_value !== undefined) {
        const v = Number(input.target_value);
        if (!Number.isFinite(v) || v <= 0) return "Error: target_value must be greater than 0";
        patch.targetValue = v;
      }
      if (input.period === "day" || input.period === "week") patch.period = input.period;
      if (asStr(input.cue_when)) patch.cueWhen = asStr(input.cue_when)!;
      if (asStr(input.action_then)) patch.actionThen = asStr(input.action_then)!;

      // extras are stored whole, so a partial edit has to be merged onto what
      // is already there or the untouched fields would be dropped.
      const woop = ["woop_outcome", "woop_obstacle", "stake"] as const;
      if (woop.some(k => asStr(input[k]) !== null)) {
        const mine = await listGoals(ctx.memberId);
        const current = mine.find(g => Number(g.id) === goalId);
        if (!current) return `Error: no goal #${goalId} of yours`;
        patch.extras = { ...(current.extras ?? {}) };
        for (const k of woop) {
          const v = asStr(input[k]);
          if (v !== null) (patch.extras as Record<string, unknown>)[k] = v;
        }
      }

      const ok = await updateGoal(ctx.memberId, goalId, patch);
      return ok ? `Goal #${goalId} updated.` : `Error: no goal #${goalId} of yours`;
    }

    case "archive_goal": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const ok = await archiveGoal(ctx.memberId, goalId);
      return ok
        ? `Goal #${goalId} archived. Its history is kept.`
        : `Error: no goal #${goalId} of yours`;
    }

    case "goal_history": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const to = asStr(input.to) ?? today;
      const from = asStr(input.from) ?? isoDateIn(ctx.tz, new Date(Date.parse(to) - 29 * 864e5));
      const rows = await goalCheckIns(ctx.memberId, goalId, from, to);
      if (rows.length === 0) return `No days logged between ${from} and ${to}.`;
      return `${rows.length} day(s) logged between ${from} and ${to}:\n` +
        rows.map(r => `${r.day}: ${r.value}${r.note ? ` (${r.note})` : ""}`).join("\n");
    }

    case "add_step": {
      const goalId = asInt(input.goal_id);
      const title = asStr(input.title);
      if (!goalId) return "Error: goal_id required";
      if (!title) return "Error: title required";
      const step = await addStep(ctx.memberId, goalId, title);
      return step
        ? `Step #${step.id} added to goal #${goalId}: ${step.title}`
        : `Error: no goal #${goalId} of yours`;
    }

    case "complete_step": {
      const stepId = asInt(input.step_id);
      if (!stepId) return "Error: step_id required";
      const done = input.done === undefined ? true : !!input.done;
      const step = await setStepDone(ctx.memberId, stepId, done);
      if (!step) return `Error: no step #${stepId} of yours`;
      return done ? `Step done: ${step.title}` : `Step reopened: ${step.title}`;
    }

    case "list_steps": {
      const goalId = asInt(input.goal_id);
      if (!goalId) return "Error: goal_id required";
      const steps = await listSteps(ctx.memberId, goalId);
      if (steps.length === 0) return `Goal #${goalId} has no steps.`;
      return steps.map(st => `#${st.id} [${st.done_at ? "x" : " "}] ${st.title}`).join("\n");
    }

    case "remove_step": {
      const stepId = asInt(input.step_id);
      if (!stepId) return "Error: step_id required";
      const ok = await removeStep(ctx.memberId, stepId);
      return ok ? `Step #${stepId} removed.` : `Error: no step #${stepId} of yours`;
    }

    case "group_summary": {
      const [board, week] = await Promise.all([getBoard(today, 30), getWeek(today)]);
      const weekLine = week.map(w => `${w.display_name}: ${w.done} this week`).join(" · ");
      const goalLines = board.map(g =>
        `- ${g.display_name}: ${g.title} — ${g.days_done_7}/7 days, ${g.days_done_30} in 30, ${g.current_run} in a row`,
      ).join("\n");
      return `${weekLine || "(no activity yet)"}\n${goalLines || "(no goals yet)"}`;
    }

    // No fallthrough to the owner's dispatcher, by design.
    default:
      return `Error: unknown tool "${name}"`;
  }
}
export const TRACKER_TOOL_NAMES = new Set(TRACKER_TOOL_DEFINITIONS.map(t => t.name));
