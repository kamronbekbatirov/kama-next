import type Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { computeNextReview, masteryFromState, statusFromHistory, type RecallScore } from "@/lib/learn/spaced-repetition";

type Tool = Anthropic.Tool;

export const TOOL_DEFINITIONS: Tool[] = [
  // ─── TODOS ─────────────────────────────────────────────────────────────────
  {
    name: "add_todo",
    description: "Add a new todo to Kamronbek's task list. Returns the new todo with its id.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Task description (max 500 chars)" },
        category: {
          type: "string",
          enum: ["general", "visa", "job", "learning", "personal"],
          description: "Task category. Default 'general'.",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Priority. Default 'medium'.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "complete_todo",
    description: "Mark a todo as done by its numeric id (visible in the snapshot as #N).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Todo id" },
      },
      required: ["id"],
    },
  },
  {
    name: "uncomplete_todo",
    description: "Mark a todo as not done (un-checks it).",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "update_todo",
    description: "Change text, category, or priority of an existing todo.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        text: { type: "string" },
        category: { type: "string", enum: ["general", "visa", "job", "learning", "personal"] },
        priority: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_todo",
    description: "Permanently delete a todo by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },

  // ─── SCHEDULE ──────────────────────────────────────────────────────────────
  {
    name: "add_schedule_block",
    description: "Add a new block to the daily schedule. start_min/end_min are minutes from midnight (e.g. 09:30 = 570).",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string" },
        start_min: { type: "integer", minimum: 0, maximum: 1440 },
        end_min: { type: "integer", minimum: 0, maximum: 1440 },
        icon: { type: "string", description: "Single emoji" },
      },
      required: ["label", "start_min", "end_min", "icon"],
    },
  },
  {
    name: "update_schedule_block",
    description: "Change a schedule block's label, time, or icon. Identify by string id (e.g. 's_fajr').",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        start_min: { type: "integer", minimum: 0, maximum: 1440 },
        end_min: { type: "integer", minimum: 0, maximum: 1440 },
        icon: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_schedule_block",
    description: "Remove a schedule block by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "reset_schedule",
    description: "Reset schedule to the original 11-block default (Fajr through Isha).",
    input_schema: { type: "object", properties: {} },
  },

  // ─── HABITS ────────────────────────────────────────────────────────────────
  {
    name: "mark_habit",
    description: "Mark a builtin habit (water/walk/workout/breakfast/quran) or prayer (fajr/dhuhr/asr/maghrib/isha) as done or not for a given date (default today).",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: ["water","walk","workout","breakfast","quran","fajr","dhuhr","asr","maghrib","isha"],
        },
        done: { type: "boolean" },
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
      },
      required: ["key", "done"],
    },
  },
  {
    name: "mark_custom_habit",
    description: "Mark a custom (non-builtin) habit done/undone for a date.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string" },
        done: { type: "boolean" },
        date: { type: "string" },
      },
      required: ["habit_id", "done"],
    },
  },
  {
    name: "add_custom_habit",
    description: "Add a new custom habit definition (visible in the Habits list every day).",
    input_schema: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  {
    name: "delete_custom_habit",
    description: "Remove a custom habit definition (only non-builtin can be deleted).",
    input_schema: {
      type: "object",
      properties: { habit_id: { type: "string" } },
      required: ["habit_id"],
    },
  },

  // ─── APPLICATIONS ──────────────────────────────────────────────────────────
  {
    name: "add_application",
    description: "Add a new job application to the tracker.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string" },
        role: { type: "string" },
        status: {
          type: "string",
          enum: ["applied", "screening", "interview", "offer", "rejected"],
        },
        notes: { type: "string" },
      },
      required: ["company", "role"],
    },
  },
  {
    name: "update_application",
    description: "Update an application's status or notes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        status: {
          type: "string",
          enum: ["applied", "screening", "interview", "offer", "rejected"],
        },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_application",
    description: "Delete an application by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },

  // ─── BUDGET ────────────────────────────────────────────────────────────────
  {
    name: "add_budget_entry",
    description: "Add an income or expense entry. Amount is the absolute number; type discriminates direction.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        amount: { type: "number", minimum: 0 },
        description: { type: "string" },
        category: { type: "string" },
      },
      required: ["type", "amount"],
    },
  },
  {
    name: "delete_budget_entry",
    description: "Delete a budget entry by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "set_initial_balance",
    description: "Set the starting balance used to compute current balance and runway.",
    input_schema: {
      type: "object",
      properties: { amount: { type: "number" } },
      required: ["amount"],
    },
  },
  {
    name: "add_subscription",
    description: "Add a recurring subscription (rendered in the monthly run-rate).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", enum: ["$", "£", "€"] },
        day: { type: "integer", minimum: 1, maximum: 31 },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "update_subscription",
    description: "Update subscription fields.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", enum: ["$", "£", "€"] },
        day: { type: "integer", minimum: 1, maximum: 31 },
        active: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_subscription",
    description: "Delete a subscription by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },

  // ─── JOURNAL ───────────────────────────────────────────────────────────────
  {
    name: "save_journal_log",
    description: "Save the daily reflection log for a given date (upserts).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
        what_worked: { type: "string" },
        tomorrow_task: { type: "string" },
        visa_progress: { type: "string" },
        workout_pushups: { type: "integer" },
        workout_plank: { type: "integer" },
        workout_walk: { type: "integer" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "add_note",
    description: "Create a new note.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["content"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note's title or content.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_note",
    description: "Delete a note by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },

  // ─── LEARN ─────────────────────────────────────────────────────────────────
  {
    name: "add_learn_subject",
    description: "Create a new knowledge subject (top-level tree).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        emoji: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_learn_subject",
    description: "Rename or update a knowledge subject (the top-level tree).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        emoji: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_learn_subject",
    description: "Delete a knowledge subject and ALL its nodes (cascade). Confirm intent before calling.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "add_learn_node",
    description: "Add a node (topic) to a subject's tree. parent_id null = root node.",
    input_schema: {
      type: "object",
      properties: {
        subject_id: { type: "integer" },
        parent_id: { type: ["integer", "null"] },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["subject_id", "title"],
    },
  },
  {
    name: "update_learn_node",
    description: "Update a learn node's title, description, status, or mastery.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["not_started","learning","reviewing","mastered"] },
        mastery_percent: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_learn_node",
    description: "Delete a learn node and ALL its sub-nodes (cascade).",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "log_recall_session",
    description: "Log an active-recall session for a learn node. Score 1-5 (5=effortless, 1=blank). Auto-recomputes spaced-repetition next_review.",
    input_schema: {
      type: "object",
      properties: {
        node_id: { type: "integer" },
        score: { type: "integer", minimum: 1, maximum: 5 },
        notes: { type: "string" },
      },
      required: ["node_id", "score"],
    },
  },
  {
    name: "add_method_entry",
    description: "Save a method entry: WOOP / 2-Minute Rule / If-Then plan / SMART goal / Public Commitment / Intrinsic motivation.",
    input_schema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["woop", "two_minute", "if_then", "goal", "commitment", "intrinsic"],
        },
        title: { type: "string", description: "Short label" },
        data: {
          type: "object",
          description: "Method-specific fields. WOOP: {wish,outcome,obstacle,plan}. two_minute: {trigger,action}. if_then: {if_part,then_part}. goal: {what,metric,deadline,progress}. commitment: {statement,partner,cadence,stake}. intrinsic: {why,autonomy,competence,relatedness}.",
        },
        subject_id: { type: ["integer", "null"], description: "Optional link to a knowledge subject" },
        node_id: { type: ["integer", "null"], description: "Optional link to a learn node" },
      },
      required: ["method", "data"],
    },
  },
  {
    name: "update_method_entry",
    description: "Update an existing method entry (WOOP/goal/etc). Pass only the fields to change.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        data: { type: "object", description: "Replaces the entry's data object" },
        active: { type: "boolean", description: "Set false to archive without deleting" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_method_entry",
    description: "Delete a method entry by id (e.g. an old WOOP, completed goal).",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "rename_custom_habit",
    description: "Rename a custom (non-builtin) habit's label.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string" },
        label: { type: "string" },
      },
      required: ["habit_id", "label"],
    },
  },
];

// ─── EXECUTOR ────────────────────────────────────────────────────────────────

interface Input { [k: string]: unknown }

function isoToday() { return new Date().toISOString().slice(0, 10); }
function asInt(v: unknown): number | null { const n = typeof v === "number" ? v : parseInt(String(v)); return isNaN(n) ? null : n; }
function asStr(v: unknown): string | null { return typeof v === "string" ? v : null; }

export async function executeTool(name: string, input: Input): Promise<string> {
  switch (name) {
    // ─── TODOS ─────────────
    case "add_todo": {
      const text = asStr(input.text)?.trim();
      if (!text) return "Error: text required";
      const rows = await query<{ id: number; text: string; category: string; priority: string }>(
        "INSERT INTO todos (text, category, priority) VALUES ($1, $2, $3) RETURNING id, text, category, priority",
        [text, asStr(input.category) ?? "general", asStr(input.priority) ?? "medium"]
      );
      const t = rows[0];
      return `Added todo #${t.id}: "${t.text}" [${t.priority.toUpperCase()}, ${t.category}]`;
    }
    case "complete_todo": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const rows = await query<{ text: string }>(
        "UPDATE todos SET done = TRUE, done_at = NOW() WHERE id = $1 RETURNING text", [id]);
      if (rows.length === 0) return `No todo with id ${id}`;
      return `Completed #${id}: "${rows[0].text}"`;
    }
    case "uncomplete_todo": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const rows = await query<{ text: string }>(
        "UPDATE todos SET done = FALSE, done_at = NULL WHERE id = $1 RETURNING text", [id]);
      if (rows.length === 0) return `No todo with id ${id}`;
      return `Re-opened #${id}: "${rows[0].text}"`;
    }
    case "update_todo": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE todos SET
           text = COALESCE($2, text),
           category = COALESCE($3, category),
           priority = COALESCE($4, priority)
         WHERE id = $1`,
        [id, asStr(input.text), asStr(input.category), asStr(input.priority)]
      );
      return `Updated todo #${id}`;
    }
    case "delete_todo": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM todos WHERE id = $1", [id]);
      return `Deleted todo #${id}`;
    }

    // ─── SCHEDULE ──────────
    case "add_schedule_block": {
      const label = asStr(input.label);
      const start = asInt(input.start_min);
      const end = asInt(input.end_min);
      const icon = asStr(input.icon);
      if (!label || start === null || end === null || !icon) return "Error: label, start_min, end_min, icon required";
      const id = `c_${Date.now()}`;
      await query(
        `INSERT INTO schedule_blocks (id, start_min, end_min, label, icon, position)
         VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(position)+1 FROM schedule_blocks), 0))`,
        [id, start, end, label, icon]
      );
      return `Added block ${icon} ${label} (${fmtMin(start)}–${fmtMin(end)}) id=${id}`;
    }
    case "update_schedule_block": {
      const id = asStr(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE schedule_blocks SET
           label = COALESCE($2, label),
           start_min = COALESCE($3, start_min),
           end_min = COALESCE($4, end_min),
           icon = COALESCE($5, icon),
           updated_at = NOW()
         WHERE id = $1`,
        [id, asStr(input.label), asInt(input.start_min), asInt(input.end_min), asStr(input.icon)]
      );
      return `Updated schedule block ${id}`;
    }
    case "delete_schedule_block": {
      const id = asStr(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM schedule_blocks WHERE id = $1", [id]);
      return `Deleted schedule block ${id}`;
    }
    case "reset_schedule": {
      await query("DELETE FROM schedule_blocks");
      const defaults = [
        ["s_fajr", 420, 450, "Фаджр + Коран", "🕌", 0],
        ["s_walk", 450, 480, "Утренняя прогулка", "🚶", 1],
        ["s_workout", 480, 510, "Домашняя тренировка", "💪", 2],
        ["s_breakfast", 510, 540, "Завтрак", "🍳", 3],
        ["s_work", 540, 780, "Основная работа", "💻", 4],
        ["s_lunch", 780, 840, "Обед + Зухр", "🍽️", 5],
        ["s_comms", 840, 900, "Коммуникации", "💬", 6],
        ["s_skills", 900, 960, "Навыки", "📚", 7],
        ["s_freelance", 960, 1080, "Фриланс", "💼", 8],
        ["s_evening", 1080, 1200, "Вечерняя рутина", "🌙", 9],
        ["s_isha", 1200, 1320, "Рефлексия + Иша", "🤲", 10],
      ];
      for (const r of defaults) {
        await query(
          "INSERT INTO schedule_blocks (id, start_min, end_min, label, icon, position) VALUES ($1,$2,$3,$4,$5,$6)",
          r as unknown[]
        );
      }
      return "Reset schedule to default (11 blocks: Fajr → Isha)";
    }

    // ─── HABITS ────────────
    case "mark_habit": {
      const key = asStr(input.key);
      const done = !!input.done;
      const date = asStr(input.date) ?? isoToday();
      const valid = ["water","walk","workout","breakfast","quran","fajr","dhuhr","asr","maghrib","isha"];
      if (!key || !valid.includes(key)) return `Error: key must be one of ${valid.join(",")}`;
      // Upsert into habits row for that date
      const existing = await query<Record<string, boolean>>(
        "SELECT * FROM habits WHERE date = $1", [date]);
      if (existing.length === 0) {
        const cols = valid.join(",");
        const placeholders = valid.map((k, i) => k === key ? `$${i+2}` : `FALSE`).join(",");
        await query(
          `INSERT INTO habits (date, ${cols}) VALUES ($1, ${placeholders})`,
          [date, done]
        );
      } else {
        await query(`UPDATE habits SET ${key} = $1 WHERE date = $2`, [done, date]);
      }
      return `${done ? "Marked" : "Unmarked"} ${key} on ${date}`;
    }
    case "mark_custom_habit": {
      const habitId = asStr(input.habit_id);
      const done = !!input.done;
      const date = asStr(input.date) ?? isoToday();
      if (!habitId) return "Error: habit_id required";
      await query(
        `INSERT INTO habit_custom_completions (date, habit_id, done) VALUES ($1, $2, $3)
         ON CONFLICT (date, habit_id) DO UPDATE SET done = EXCLUDED.done`,
        [date, habitId, done]
      );
      return `${done ? "Marked" : "Unmarked"} custom habit ${habitId} on ${date}`;
    }
    case "add_custom_habit": {
      const label = asStr(input.label)?.trim();
      if (!label) return "Error: label required";
      const id = `c_${Date.now()}`;
      await query(
        `INSERT INTO habit_defs (id, label, builtin, position)
         VALUES ($1, $2, FALSE, COALESCE((SELECT MAX(position)+1 FROM habit_defs), 0))`,
        [id, label]
      );
      return `Added custom habit "${label}" (id=${id})`;
    }
    case "delete_custom_habit": {
      const habitId = asStr(input.habit_id);
      if (!habitId) return "Error: habit_id required";
      await query("DELETE FROM habit_defs WHERE id = $1 AND builtin = FALSE", [habitId]);
      return `Deleted custom habit ${habitId}`;
    }

    // ─── APPLICATIONS ──────
    case "add_application": {
      const company = asStr(input.company)?.trim();
      const role = asStr(input.role)?.trim();
      if (!company || !role) return "Error: company and role required";
      const rows = await query<{ id: number }>(
        `INSERT INTO applications (company, role, status, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
        [company, role, asStr(input.status) ?? "applied", asStr(input.notes)]
      );
      return `Added application #${rows[0].id}: ${company} · ${role}`;
    }
    case "update_application": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE applications SET
           status = COALESCE($2, status),
           notes = COALESCE($3, notes)
         WHERE id = $1`,
        [id, asStr(input.status), asStr(input.notes)]
      );
      return `Updated application #${id}`;
    }
    case "delete_application": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM applications WHERE id = $1", [id]);
      return `Deleted application #${id}`;
    }

    // ─── BUDGET ────────────
    case "add_budget_entry": {
      const type = asStr(input.type);
      const amount = typeof input.amount === "number" ? input.amount : parseFloat(String(input.amount));
      if (!type || (type !== "income" && type !== "expense")) return "Error: type must be 'income' or 'expense'";
      if (isNaN(amount) || amount <= 0) return "Error: amount must be positive";
      const rows = await query<{ id: number }>(
        `INSERT INTO budget_entries (type, amount, description, category, date) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING id`,
        [type, amount, asStr(input.description), asStr(input.category)]
      );
      return `Added ${type} #${rows[0].id}: $${amount}${input.description ? ` "${input.description}"` : ""}`;
    }
    case "delete_budget_entry": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM budget_entries WHERE id = $1", [id]);
      return `Deleted budget entry #${id}`;
    }
    case "set_initial_balance": {
      const amount = typeof input.amount === "number" ? input.amount : parseFloat(String(input.amount));
      if (isNaN(amount)) return "Error: amount must be a number";
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('initial_balance', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(amount)]
      );
      return `Set initial balance to $${amount}`;
    }
    case "add_subscription": {
      const name = asStr(input.name)?.trim();
      const amount = typeof input.amount === "number" ? input.amount : parseFloat(String(input.amount));
      if (!name || isNaN(amount) || amount <= 0) return "Error: name and positive amount required";
      const id = `s_${Date.now()}`;
      await query(
        `INSERT INTO subscriptions (id, name, amount, currency, day, active) VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [id, name, amount, asStr(input.currency) ?? "$", Math.max(1, Math.min(31, asInt(input.day) ?? 1))]
      );
      return `Added subscription ${name}: ${asStr(input.currency) ?? "$"}${amount} on day ${asInt(input.day) ?? 1} (id=${id})`;
    }
    case "update_subscription": {
      const id = asStr(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE subscriptions SET
           name = COALESCE($2, name),
           amount = COALESCE($3, amount),
           currency = COALESCE($4, currency),
           day = COALESCE($5, day),
           active = COALESCE($6, active)
         WHERE id = $1`,
        [id, asStr(input.name), typeof input.amount === "number" ? input.amount : null,
         asStr(input.currency), asInt(input.day), typeof input.active === "boolean" ? input.active : null]
      );
      return `Updated subscription ${id}`;
    }
    case "delete_subscription": {
      const id = asStr(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM subscriptions WHERE id = $1", [id]);
      return `Deleted subscription ${id}`;
    }

    // ─── JOURNAL ───────────
    case "save_journal_log": {
      const date = asStr(input.date) ?? isoToday();
      await query(
        `INSERT INTO daily_log (date, what_worked, tomorrow_task, visa_progress, workout_pushups, workout_plank, workout_walk, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (date) DO UPDATE SET
           what_worked = COALESCE(EXCLUDED.what_worked, daily_log.what_worked),
           tomorrow_task = COALESCE(EXCLUDED.tomorrow_task, daily_log.tomorrow_task),
           visa_progress = COALESCE(EXCLUDED.visa_progress, daily_log.visa_progress),
           workout_pushups = COALESCE(EXCLUDED.workout_pushups, daily_log.workout_pushups),
           workout_plank = COALESCE(EXCLUDED.workout_plank, daily_log.workout_plank),
           workout_walk = COALESCE(EXCLUDED.workout_walk, daily_log.workout_walk),
           notes = COALESCE(EXCLUDED.notes, daily_log.notes),
           updated_at = NOW()`,
        [date, asStr(input.what_worked), asStr(input.tomorrow_task), asStr(input.visa_progress),
         asInt(input.workout_pushups) ?? 0, asInt(input.workout_plank) ?? 0,
         asInt(input.workout_walk) ?? 0, asStr(input.notes)]
      );
      return `Saved journal log for ${date}`;
    }
    case "add_note": {
      const content = asStr(input.content);
      if (!content) return "Error: content required";
      const rows = await query<{ id: number }>(
        "INSERT INTO notes (title, content, updated_at) VALUES ($1, $2, NOW()) RETURNING id",
        [asStr(input.title) ?? "", content]
      );
      return `Added note #${rows[0].id}${input.title ? `: "${input.title}"` : ""}`;
    }
    case "update_note": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE notes SET
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           updated_at = NOW()
         WHERE id = $1`,
        [id, asStr(input.title), asStr(input.content)]
      );
      return `Updated note #${id}`;
    }
    case "delete_note": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM notes WHERE id = $1", [id]);
      return `Deleted note #${id}`;
    }

    // ─── LEARN ─────────────
    case "add_learn_subject": {
      const title = asStr(input.title)?.trim();
      if (!title) return "Error: title required";
      const rows = await query<{ id: number }>(
        `INSERT INTO learn_subjects (title, emoji, description, position)
         VALUES ($1, $2, $3, COALESCE((SELECT MAX(position)+1 FROM learn_subjects), 0)) RETURNING id`,
        [title, asStr(input.emoji), asStr(input.description)]
      );
      return `Added subject #${rows[0].id}: ${asStr(input.emoji) ?? "📘"} ${title}`;
    }
    case "update_learn_subject": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE learn_subjects SET
           title = COALESCE($2, title),
           emoji = COALESCE($3, emoji),
           description = COALESCE($4, description),
           updated_at = NOW()
         WHERE id = $1`,
        [id, asStr(input.title), asStr(input.emoji), asStr(input.description)]
      );
      return `Updated subject #${id}`;
    }
    case "delete_learn_subject": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const rows = await query<{ title: string }>(
        "DELETE FROM learn_subjects WHERE id = $1 RETURNING title", [id]);
      if (rows.length === 0) return `No subject with id ${id}`;
      return `Deleted subject #${id} "${rows[0].title}" (and all its nodes)`;
    }
    case "add_learn_node": {
      const subjectId = asInt(input.subject_id);
      const title = asStr(input.title)?.trim();
      if (!subjectId || !title) return "Error: subject_id and title required";
      const parentId = asInt(input.parent_id);
      const rows = await query<{ id: number }>(
        `INSERT INTO learn_nodes (subject_id, parent_id, title, description, position)
         VALUES ($1, $2, $3, $4,
           COALESCE((SELECT MAX(position)+1 FROM learn_nodes WHERE subject_id = $1 AND parent_id IS NOT DISTINCT FROM $2), 0))
         RETURNING id`,
        [subjectId, parentId, title, asStr(input.description)]
      );
      return `Added node #${rows[0].id}: "${title}" (subject ${subjectId}${parentId ? `, parent ${parentId}` : ", root"})`;
    }
    case "update_learn_node": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query(
        `UPDATE learn_nodes SET
           title = COALESCE($2, title),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           mastery_percent = COALESCE($5, mastery_percent),
           updated_at = NOW()
         WHERE id = $1`,
        [id, asStr(input.title), asStr(input.description),
         asStr(input.status), asInt(input.mastery_percent)]
      );
      return `Updated learn node #${id}`;
    }
    case "delete_learn_node": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM learn_nodes WHERE id = $1", [id]);
      return `Deleted node #${id} (with all sub-nodes)`;
    }
    case "log_recall_session": {
      const nodeId = asInt(input.node_id);
      const score = asInt(input.score) as RecallScore | null;
      if (!nodeId || !score || score < 1 || score > 5) return "Error: node_id and score (1-5) required";
      const nodes = await query<{ ease_factor: number; interval_days: number; status: string }>(
        "SELECT ease_factor, interval_days, status FROM learn_nodes WHERE id = $1", [nodeId]);
      if (nodes.length === 0) return `No node with id ${nodeId}`;
      const node = nodes[0];
      const next = computeNextReview(
        { ease_factor: node.ease_factor, interval_days: node.interval_days },
        score
      );
      const newStatus = statusFromHistory(score, node.status);
      const newMastery = masteryFromState(next.ease_factor, next.interval_days);
      await query(
        `INSERT INTO learn_sessions (node_id, recall_score, notes) VALUES ($1, $2, $3)`,
        [nodeId, score, asStr(input.notes)]
      );
      await query(
        `UPDATE learn_nodes SET ease_factor = $2, interval_days = $3, next_review = $4,
           status = $5, mastery_percent = $6, updated_at = NOW() WHERE id = $1`,
        [nodeId, next.ease_factor, next.interval_days, next.next_review, newStatus, newMastery]
      );
      return `Logged recall on node #${nodeId} score=${score}. Next review: ${next.next_review.toISOString().slice(0,10)} (status=${newStatus}, mastery=${newMastery}%)`;
    }
    case "add_method_entry": {
      const method = asStr(input.method);
      const valid = ["woop","two_minute","if_then","goal","commitment","intrinsic"];
      if (!method || !valid.includes(method)) return `Error: method must be one of ${valid.join(",")}`;
      const data = (typeof input.data === "object" && input.data !== null) ? input.data : {};
      const rows = await query<{ id: number }>(
        `INSERT INTO learn_methods (method, title, data, subject_id, node_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [method, asStr(input.title), JSON.stringify(data),
         asInt(input.subject_id), asInt(input.node_id)]
      );
      return `Added ${method} entry #${rows[0].id}${input.title ? `: "${input.title}"` : ""}`;
    }
    case "update_method_entry": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const data = (typeof input.data === "object" && input.data !== null) ? input.data : null;
      await query(
        `UPDATE learn_methods SET
           title = COALESCE($2, title),
           data = COALESCE($3::jsonb, data),
           active = COALESCE($4, active),
           updated_at = NOW()
         WHERE id = $1`,
        [id, asStr(input.title), data ? JSON.stringify(data) : null,
         typeof input.active === "boolean" ? input.active : null]
      );
      return `Updated method entry #${id}`;
    }
    case "delete_method_entry": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      await query("DELETE FROM learn_methods WHERE id = $1", [id]);
      return `Deleted method entry #${id}`;
    }
    case "rename_custom_habit": {
      const habitId = asStr(input.habit_id);
      const label = asStr(input.label)?.trim();
      if (!habitId || !label) return "Error: habit_id and label required";
      const rows = await query<{ id: string }>(
        "UPDATE habit_defs SET label = $1, updated_at = NOW() WHERE id = $2 AND builtin = FALSE RETURNING id",
        [label, habitId]
      );
      if (rows.length === 0) return `No editable custom habit with id ${habitId} (builtin habits cannot be renamed)`;
      return `Renamed custom habit ${habitId} → "${label}"`;
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}

function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
