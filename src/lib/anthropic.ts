import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/anthropic-tools";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 10;

const PRAYER_IDS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const HABIT_IDS  = ["water", "walk", "workout", "breakfast", "quran"] as const;

function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function isoToday() { return new Date().toISOString().slice(0, 10); }

interface DashboardSnapshot {
  date: string;
  time: string;
  schedule: { id: string; start_min: number; end_min: number; label: string; icon: string }[];
  habitsToday: Record<string, boolean | null>;
  customHabits: { id: string; label: string; done: boolean }[];
  todos: { id: number; text: string; category: string; priority: string; done: boolean; created_at: string }[];
  recentlyCompletedTodos: { id: number; text: string; category: string; done_at: string }[];
  applications: { id: number; company: string; role: string; status: string; notes: string | null }[];
  budget: {
    initialBalance: number;
    balance: number;
    monthlySpend: number;
    subscriptions: { id: string; name: string; amount: number; currency: string; day: number; active: boolean }[];
    recent: { id: number; type: string; amount: number; description: string | null; category: string | null; date: string }[];
  };
  learnSubjects: { id: number; title: string; emoji: string | null }[];
  learnNodes: { id: number; subject_id: number; parent_id: number | null; title: string; status: string; mastery_percent: number; next_review: string | null }[];
  learnMethods: { id: number; method: string; title: string | null; data: unknown; created_at: string }[];
  recentRecallSessions: { id: number; node_id: number; node_title: string; subject_title: string; recall_score: number; created_at: string }[];
  recentLogs: { date: string; what_worked: string | null; tomorrow_task: string | null; visa_progress: string | null; workout_pushups: number | null; workout_plank: number | null; workout_walk: number | null; notes: string | null }[];
  recentNotes: { id: number; title: string; content: string; updated_at: string }[];
  reviewQueue: { id: number; title: string; subject_title: string; next_review: string }[];
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const dt = isoToday();
  const now = new Date();

  const [
    schedule, habitsToday, customHabits, customDoneRows,
    todos, recentlyCompletedTodos, applications,
    budgetEntries, subs, balanceSetting,
    learnSubjects, learnNodes, learnMethods, recentRecallSessions,
    recentLogs, recentNotes, reviewQueue,
  ] = await Promise.all([
    query<{ id: string; start_min: number; end_min: number; label: string; icon: string }>(
      "SELECT id, start_min, end_min, label, icon FROM schedule_blocks ORDER BY start_min"
    ),
    query<Record<string, boolean>>(
      "SELECT * FROM habits WHERE date = $1 LIMIT 1", [dt]
    ),
    query<{ id: string; label: string; builtin: boolean }>(
      "SELECT id, label, builtin FROM habit_defs WHERE builtin = FALSE ORDER BY position"
    ),
    query<{ habit_id: string; done: boolean }>(
      "SELECT habit_id, done FROM habit_custom_completions WHERE date = $1", [dt]
    ),
    query<{ id: number; text: string; category: string; priority: string; done: boolean; created_at: string }>(
      "SELECT id, text, category, priority, done, created_at FROM todos WHERE done = FALSE ORDER BY priority DESC, created_at DESC LIMIT 30"
    ),
    query<{ id: number; text: string; category: string; done_at: string }>(
      "SELECT id, text, category, done_at::text AS done_at FROM todos WHERE done = TRUE AND done_at >= NOW() - INTERVAL '7 days' ORDER BY done_at DESC LIMIT 15"
    ),
    query<{ id: number; company: string; role: string; status: string; notes: string | null }>(
      "SELECT id, company, role, status, notes FROM applications ORDER BY created_at DESC LIMIT 25"
    ),
    query<{ id: number; type: string; amount: number; description: string | null; category: string | null; date: string }>(
      "SELECT id, type, amount::float AS amount, description, category, date::text FROM budget_entries ORDER BY date DESC, created_at DESC LIMIT 30"
    ),
    query<{ id: string; name: string; amount: number; currency: string; day: number; active: boolean }>(
      "SELECT id, name, amount::float AS amount, currency, day, active FROM subscriptions"
    ),
    query<{ value: number | string }>(
      "SELECT value FROM settings WHERE key = 'initial_balance'"
    ),
    query<{ id: number; title: string; emoji: string | null }>(
      "SELECT id, title, emoji FROM learn_subjects ORDER BY position"
    ),
    query<{ id: number; subject_id: number; parent_id: number | null; title: string; status: string; mastery_percent: number; next_review: string | null }>(
      "SELECT id, subject_id, parent_id, title, status, mastery_percent, next_review::text FROM learn_nodes ORDER BY subject_id, parent_id NULLS FIRST, position"
    ),
    query<{ id: number; method: string; title: string | null; data: unknown; created_at: string }>(
      "SELECT id, method, title, data, created_at FROM learn_methods WHERE active = TRUE ORDER BY created_at DESC LIMIT 25"
    ),
    query<{ id: number; node_id: number; node_title: string; subject_title: string; recall_score: number; created_at: string }>(
      `SELECT s.id, s.node_id, n.title AS node_title, sub.title AS subject_title, s.recall_score, s.created_at::text
       FROM learn_sessions s
       JOIN learn_nodes n ON n.id = s.node_id
       JOIN learn_subjects sub ON sub.id = n.subject_id
       ORDER BY s.created_at DESC LIMIT 15`
    ),
    query<{ date: string; what_worked: string | null; tomorrow_task: string | null; visa_progress: string | null; workout_pushups: number | null; workout_plank: number | null; workout_walk: number | null; notes: string | null }>(
      "SELECT date::text, what_worked, tomorrow_task, visa_progress, workout_pushups, workout_plank, workout_walk, notes FROM daily_log ORDER BY date DESC LIMIT 7"
    ),
    query<{ id: number; title: string; content: string; updated_at: string }>(
      "SELECT id, title, content, updated_at FROM notes ORDER BY updated_at DESC LIMIT 10"
    ),
    query<{ id: number; title: string; subject_title: string; next_review: string }>(
      `SELECT n.id, n.title, s.title AS subject_title, n.next_review::text
       FROM learn_nodes n JOIN learn_subjects s ON s.id = n.subject_id
       WHERE n.next_review IS NOT NULL AND n.next_review <= NOW()
       ORDER BY n.next_review ASC LIMIT 20`
    ),
  ]);

  const habits = habitsToday[0] ?? {};
  const customDone = Object.fromEntries(customDoneRows.map(r => [r.habit_id, r.done]));

  const initialBalance = Number(balanceSetting[0]?.value ?? 0);
  const balance = initialBalance + budgetEntries.reduce(
    (s, e) => e.type === "income" ? s + Number(e.amount) : s - Number(e.amount), 0,
  );
  const monthlySpend = budgetEntries.filter(e => e.type === "expense")
    .reduce((s, e) => s + Number(e.amount), 0)
    + subs.filter(x => x.active).reduce((s, x) => s + Number(x.amount), 0);

  return {
    date: dt,
    time: now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }),
    schedule,
    habitsToday: Object.fromEntries(
      [...PRAYER_IDS, ...HABIT_IDS].map(k => [k, (habits as Record<string, boolean | null>)[k] ?? null])
    ),
    customHabits: customHabits.map(h => ({ id: h.id, label: h.label, done: !!customDone[h.id] })),
    todos,
    recentlyCompletedTodos,
    applications,
    budget: {
      initialBalance,
      balance,
      monthlySpend,
      subscriptions: subs,
      recent: budgetEntries.slice(0, 15),
    },
    learnSubjects,
    learnNodes,
    learnMethods,
    recentRecallSessions,
    recentLogs,
    recentNotes,
    reviewQueue,
  };
}

export function renderContext(snap: DashboardSnapshot): string {
  const habitMark = (k: string) => snap.habitsToday[k] ? "✓" : "○";
  const prayersDone = PRAYER_IDS.filter(p => snap.habitsToday[p]).length;
  const habitsDone  = HABIT_IDS.filter(h => snap.habitsToday[h]).length;

  const sections: string[] = [];

  sections.push(`# Now
- Date: ${snap.date} (London time ${snap.time})`);

  sections.push(`# Today's schedule (id → block)
${snap.schedule.length === 0 ? "(empty)" : snap.schedule.map(b =>
    `- [${b.id}] ${fmtMin(b.start_min)}–${fmtMin(b.end_min)} ${b.icon} ${b.label}`,
  ).join("\n")}`);

  sections.push(`# Today's habits
- Prayers (${prayersDone}/5): ${PRAYER_IDS.map(p => `${p}=${habitMark(p)}`).join(" ")}
- Builtin habits (${habitsDone}/5): ${HABIT_IDS.map(h => `${h}=${habitMark(h)}`).join(" ")}
- Custom habits: ${snap.customHabits.length === 0 ? "(none)" : snap.customHabits.map(h => `${h.label}[${h.id}]=${h.done ? "✓" : "○"}`).join(", ")}`);

  if (snap.todos.length > 0) {
    sections.push(`# Active todos (${snap.todos.length})
${snap.todos.slice(0, 25).map(t => `- #${t.id} [${t.priority.toUpperCase()}] [${t.category}] ${t.text}`).join("\n")}`);
  } else {
    sections.push(`# Active todos: (none)`);
  }

  if (snap.recentlyCompletedTodos.length > 0) {
    sections.push(`# Recently completed todos (last 7 days)
${snap.recentlyCompletedTodos.slice(0, 10).map(t => `- #${t.id} [${t.category}] ${t.text} (${t.done_at.slice(0, 10)})`).join("\n")}`);
  }

  if (snap.applications.length > 0) {
    sections.push(`# Job applications (${snap.applications.length})
${snap.applications.slice(0, 20).map(a =>
      `- #${a.id} ${a.company} · ${a.role} · ${a.status.toUpperCase()}${a.notes ? ` — ${a.notes}` : ""}`,
    ).join("\n")}`);
  }

  sections.push(`# Budget
- Initial balance: $${snap.budget.initialBalance.toLocaleString()}
- Current balance: $${snap.budget.balance.toLocaleString()}
- Monthly outflow (spend + active subs): $${snap.budget.monthlySpend.toLocaleString()}
- Subscriptions: ${snap.budget.subscriptions.filter(s => s.active).length} active${
    snap.budget.subscriptions.filter(s => s.active).length === 0 ? "" :
    ` (${snap.budget.subscriptions.filter(s => s.active).map(s => `[${s.id}] ${s.name} ${s.currency}${s.amount}/mo on day ${s.day}`).join(", ")})`
  }
${snap.budget.recent.length === 0 ? "" : `\nRecent entries:\n${snap.budget.recent.slice(0, 10).map(e =>
    `- #${e.id} ${e.date} ${e.type}: ${e.type === "income" ? "+" : "−"}$${e.amount}${e.description ? ` "${e.description}"` : ""}${e.category ? ` (${e.category})` : ""}`,
  ).join("\n")}`}`);

  if (snap.learnSubjects.length > 0) {
    const lines = snap.learnSubjects.map(s => {
      const subjNodes = snap.learnNodes.filter(n => n.subject_id === s.id);
      const avgMastery = subjNodes.length > 0
        ? Math.round(subjNodes.reduce((a, n) => a + n.mastery_percent, 0) / subjNodes.length)
        : 0;
      return `- subject #${s.id} ${s.emoji ?? "📘"} ${s.title} (${subjNodes.length} nodes, ${avgMastery}% avg mastery)`;
    });
    sections.push(`# Knowledge trees\n${lines.join("\n")}`);
    if (snap.learnNodes.length > 0) {
      sections.push(`## All learn nodes (id → status, mastery%)
${snap.learnNodes.slice(0, 50).map(n => {
        const subj = snap.learnSubjects.find(s => s.id === n.subject_id);
        return `- node #${n.id} (subject ${subj?.title ?? n.subject_id}${n.parent_id ? `, parent ${n.parent_id}` : ""}) "${n.title}" — ${n.status} ${n.mastery_percent}%${n.next_review ? ` next:${n.next_review.slice(0,10)}` : ""}`;
      }).join("\n")}`);
    }
    if (snap.reviewQueue.length > 0) {
      sections.push(`## Due for review now (${snap.reviewQueue.length})
${snap.reviewQueue.slice(0, 15).map(r => `- node #${r.id}: ${r.subject_title} → ${r.title}`).join("\n")}`);
    }
    if (snap.recentRecallSessions.length > 0) {
      sections.push(`## Recent recall sessions
${snap.recentRecallSessions.slice(0, 10).map(s => `- ${s.created_at.slice(0,16).replace("T"," ")} ${s.subject_title} → ${s.node_title} score=${s.recall_score}`).join("\n")}`);
    }
  }

  if (snap.learnMethods.length > 0) {
    sections.push(`# Method entries (WOOP, goals, commitments, etc.)
${snap.learnMethods.slice(0, 15).map(m => {
      const data = m.data as Record<string, string>;
      const summary = m.method === "woop"
        ? `wish="${data.wish ?? ""}" obstacle="${data.obstacle ?? ""}"`
        : m.method === "goal"
        ? `${data.what ?? ""} (${data.progress ?? "0"}% by ${data.deadline ?? "no deadline"})`
        : m.method === "if_then"
        ? `If ${data.if_part ?? ""} → ${data.then_part ?? ""}`
        : m.method === "two_minute"
        ? `${data.trigger ?? ""} → ${data.action ?? ""}`
        : m.method === "commitment"
        ? `"${data.statement ?? ""}" with ${data.partner ?? ""}`
        : m.method === "intrinsic"
        ? `Why: ${data.why ?? ""}`
        : "";
      return `- #${m.id} [${m.method}] ${m.title ?? "—"}${summary ? ` · ${summary}` : ""}`;
    }).join("\n")}`);
  }

  if (snap.recentLogs.length > 0) {
    sections.push(`# Recent journal (last 7 days)
${snap.recentLogs.map(l => {
      const parts = [
        l.what_worked && `worked: ${l.what_worked}`,
        l.tomorrow_task && `tomorrow: ${l.tomorrow_task}`,
        l.visa_progress && `visa: ${l.visa_progress}`,
        (l.workout_pushups || l.workout_plank || l.workout_walk) &&
          `workout: pushups=${l.workout_pushups ?? 0} plank=${l.workout_plank ?? 0}s walk=${l.workout_walk ?? 0}min`,
        l.notes && `notes: ${l.notes}`,
      ].filter(Boolean);
      return `- ${l.date}: ${parts.join(" · ") || "(empty)"}`;
    }).join("\n")}`);
  }

  if (snap.recentNotes.length > 0) {
    sections.push(`# Recent notes
${snap.recentNotes.slice(0, 5).map(n => {
      const snippet = n.content.length > 200 ? n.content.slice(0, 200) + "…" : n.content;
      return `## #${n.id} ${n.title || "(untitled)"}\n${snippet}`;
    }).join("\n\n")}`);
  }

  return sections.join("\n\n");
}

const SYSTEM_INSTRUCTIONS = `You are Kamronbek's personal assistant living inside his private Telegram dashboard. You have full access to every part of his life via the structured snapshot below: schedule, habits, todos, job applications, budget, knowledge trees, methods (WOOP, goals, commitments), and journal.

You also have TOOLS to MODIFY anything in his dashboard. Use them whenever he asks you to add, change, complete, or delete something — don't ask for permission for routine changes. After running a tool, briefly confirm in plain language what you did. For destructive operations on substantial data (deleting whole subjects/trees, deleting many applications), confirm first if intent is ambiguous.

Tool-use principles:
- Look up IDs from the snapshot (todos #N, applications #N, schedule [id], etc.).
- If the user asks for something modified across multiple items, run multiple tool calls in sequence.
- After tools succeed, summarise what you did. Don't dump tool output verbatim.
- If a tool fails, explain why; don't silently retry the same call.

Behaviour:
- He writes mostly in Russian. Match his language; reply in Russian unless he writes in English or Uzbek.
- Be direct, warm, and concise. He's 23, building software in London, working toward a software engineer role and broader self-mastery (math from first principles, methodical learning, deliberate practice). Treat him like a smart friend, not a help desk.
- Use the data below to ground every answer. Don't make stuff up — if the data doesn't say, say so.
- For learning questions, lean on the science he already trusts (active recall, spaced repetition, deliberate practice, WOOP, Locke-Latham, implementation intentions).
- Do NOT use markdown headings or asterisk-bullets unless the answer truly needs structure — Telegram renders them awkwardly. Prefer short paragraphs. If you must list, use plain "•" or numbers.
- If asked something dangerous, illegal, or ethically off, decline briefly without lecturing.

His current data:`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function buildSystemPrompt(): Promise<string> {
  const snap = await getDashboardSnapshot();
  return `${SYSTEM_INSTRUCTIONS}\n\n${renderContext(snap)}`;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  toolCalls: { name: string; input: unknown; result: string }[];
}

/**
 * Runs a Claude conversation turn with the tool-use loop.
 * Loops until the model emits an `end_turn` (no more tool calls) or hits MAX_TOOL_ITERATIONS.
 */
export async function runChat(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  let totalIn = 0, totalOut = 0, cacheRead = 0, cacheCreate = 0;
  const toolCalls: ChatResult["toolCalls"] = [];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools: TOOL_DEFINITIONS,
    });

    totalIn += response.usage.input_tokens ?? 0;
    totalOut += response.usage.output_tokens ?? 0;
    cacheRead += response.usage.cache_read_input_tokens ?? 0;
    cacheCreate += response.usage.cache_creation_input_tokens ?? 0;

    // Append assistant turn to messages for the next iteration
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      // End of conversation
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
      return { text, inputTokens: totalIn, outputTokens: totalOut,
               cacheReadTokens: cacheRead, cacheCreateTokens: cacheCreate, toolCalls };
    }

    // Execute all tool_use blocks in this response
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let resultText: string;
      let isError = false;
      try {
        resultText = await executeTool(block.name, block.input as Record<string, unknown>);
      } catch (e) {
        resultText = "Error: " + (e instanceof Error ? e.message : String(e));
        isError = true;
      }
      toolCalls.push({ name: block.name, input: block.input, result: resultText });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultText,
        is_error: isError || undefined,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit iteration cap
  return {
    text: "(reached tool-use iteration limit; stopping)",
    inputTokens: totalIn,
    outputTokens: totalOut,
    cacheReadTokens: cacheRead,
    cacheCreateTokens: cacheCreate,
    toolCalls,
  };
}
