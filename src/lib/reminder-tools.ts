import type Anthropic from "@anthropic-ai/sdk";
import { listReminders, createReminder, deleteReminder } from "@/lib/reminders";
import { isoDateIn } from "@/lib/timezone";

/**
 * Reminder tools, shared by the owner and by guests.
 *
 * Safe to hand to both because `member_id` is never a parameter — it comes from
 * the resolved session, so the model cannot address anyone else's reminders
 * however it is asked to.
 */

export const REMINDER_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "create_reminder",
    description:
      "Set a reminder that the bot will send them in Telegram. Use it whenever someone asks to be reminded of something. Time is HH:MM in their own timezone. Give `days` for a weekly pattern (weekdays, Mondays, …), `once_on` for a single date, and neither for every day. Confirm the time back to them in words after creating it.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind them about, in their own words." },
        at: { type: "string", description: "HH:MM, 24-hour, their local time." },
        days: {
          type: "array",
          items: { type: "integer", minimum: 1, maximum: 7 },
          description: "ISO weekdays (1=Mon … 7=Sun). Weekdays are [1,2,3,4,5]. Omit for every day.",
        },
        once_on: { type: "string", description: "ISO date YYYY-MM-DD for a one-off reminder." },
      },
      required: ["text", "at"],
    },
  },
  {
    name: "list_reminders",
    description: "Their active reminders, with the id needed to delete one.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_reminder",
    description: "Turn off one of their reminders.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
];

export const REMINDER_TOOL_NAMES = new Set(REMINDER_TOOL_DEFINITIONS.map(t => t.name));

type Input = Record<string, unknown>;
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const DAY_NAMES = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
function describe(days: number[] | null, onceOn: string | null): string {
  if (onceOn) return `один раз ${onceOn}`;
  if (!days || days.length === 0 || days.length === 7) return "каждый день";
  return days.slice().sort().map(d => DAY_NAMES[d] ?? d).join(", ");
}

export async function executeReminderTool(
  name: string, input: Input, ctx: { memberId: string; tz: string },
): Promise<string> {
  switch (name) {
    case "create_reminder": {
      const text = asStr(input.text);
      const at = asStr(input.at);
      if (!text) return "Error: text required";
      if (!at || !/^\d{1,2}:\d{2}$/.test(at)) return "Error: at must be HH:MM";
      const [h, m] = at.split(":").map(Number);
      if (h > 23 || m > 59) return "Error: at must be a real time";

      const days = Array.isArray(input.days)
        ? (input.days as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7)
        : null;
      const onceOn = asStr(input.once_on);
      if (onceOn && !/^\d{4}-\d{2}-\d{2}$/.test(onceOn)) return "Error: once_on must be YYYY-MM-DD";
      // A one-off already in the past would sit there and never fire.
      if (onceOn && onceOn < isoDateIn(ctx.tz)) return "Error: that date has already passed";

      const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const r = await createReminder(ctx.memberId, { text, at: hhmm, days, onceOn });
      return `Reminder #${r.id} set for ${hhmm}, ${describe(r.days, r.once_on)}: ${r.text}`;
    }

    case "list_reminders": {
      const rows = await listReminders(ctx.memberId);
      if (rows.length === 0) return "No reminders set.";
      return rows.map(r => `#${r.id} ${r.remind_at} (${describe(r.days, r.once_on)}) — ${r.text}`).join("\n");
    }

    case "delete_reminder": {
      const id = Number(input.id);
      if (!Number.isInteger(id)) return "Error: id required";
      const ok = await deleteReminder(ctx.memberId, id);
      return ok ? `Reminder #${id} turned off.` : `Error: no reminder #${id} of theirs`;
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
