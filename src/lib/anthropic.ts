import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/anthropic-tools";
import { getServerStatus, type ServerStatus } from "@/lib/server-status";
import { getTimezone } from "@/lib/timezone";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 10;
// Was 2048 — too small for batch-style asks ("add these 19 applications"),
// since each tool_use block costs a few dozen tokens of JSON input and the
// model would hit the cap, emit stop_reason=max_tokens, and never run tools.
const MAX_OUTPUT_TOKENS = 8192;

const PRAYER_IDS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function isoToday() { return new Date().toISOString().slice(0, 10); }
// Notes are stored as rich-text HTML (older / Claude-written notes may be plain
// text). Flatten to readable text for the snapshot.
function htmlToText(content: string): string {
  if (!content) return "";
  if (!content.includes("<")) return content;
  return content
    .replace(/<li[^>]*data-checked="true"[^>]*>/gi, "[x] ")
    .replace(/<li[^>]*data-checked="false"[^>]*>/gi, "[ ] ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// `due_at::text` comes back like "2026-06-10 15:30:00+00"; render it in the
// configured timezone.
function fmtDueTz(iso: string, tz: string): string {
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

interface DashboardSnapshot {
  date: string;
  time: string;
  tz: string;
  schedule: { id: string; start_min: number; end_min: number; label: string; icon: string }[];
  prayersToday: Record<string, boolean>;
  habitsList: { id: string; label: string; builtin: boolean; done: boolean }[];
  todos: { id: number; text: string; category: string; priority: string; status: string; created_at: string; due_at: string | null }[];
  recentlyCompletedTodos: { id: number; text: string; category: string; done_at: string }[];
  archivedTodos: { id: number; text: string; category: string; priority: string; status: string }[];
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
  recentNotes: { id: number; title: string; content: string; updated_at: string; locked: boolean }[];
  reviewQueue: { id: number; title: string; subject_title: string; next_review: string }[];
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const dt = isoToday();
  const now = new Date();
  const tz = await getTimezone();

  const [
    schedule, habitsToday, habitDefs, customDoneRows,
    todos, recentlyCompletedTodos, archivedTodos, applications,
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
      "SELECT id, label, builtin FROM habit_defs ORDER BY builtin DESC, position"
    ),
    query<{ habit_id: string; done: boolean }>(
      "SELECT habit_id, done FROM habit_custom_completions WHERE date = $1", [dt]
    ),
    query<{ id: number; text: string; category: string; priority: string; status: string; created_at: string; due_at: string | null }>(
      `SELECT id, text, category, priority, status, created_at, due_at::text FROM todos
       WHERE archived = FALSE AND status <> 'done'
       ORDER BY status, position ASC, created_at DESC LIMIT 40`
    ),
    query<{ id: number; text: string; category: string; done_at: string }>(
      `SELECT id, text, category, done_at::text AS done_at FROM todos
       WHERE status = 'done' AND archived = FALSE AND done_at >= NOW() - INTERVAL '7 days'
       ORDER BY done_at DESC LIMIT 15`
    ),
    query<{ id: number; text: string; category: string; priority: string; status: string }>(
      "SELECT id, text, category, priority, status FROM todos WHERE archived = TRUE ORDER BY id DESC LIMIT 20"
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
    query<{ id: number; title: string; content: string; updated_at: string; locked: boolean }>(
      // Locked notes never expose their body to the assistant.
      "SELECT id, title, CASE WHEN locked THEN '' ELSE content END AS content, locked, updated_at FROM notes ORDER BY updated_at DESC LIMIT 10"
    ),
    query<{ id: number; title: string; subject_title: string; next_review: string }>(
      `SELECT n.id, n.title, s.title AS subject_title, n.next_review::text
       FROM learn_nodes n JOIN learn_subjects s ON s.id = n.subject_id
       WHERE n.next_review IS NOT NULL AND n.next_review <= NOW()
       ORDER BY n.next_review ASC LIMIT 20`
    ),
  ]);

  const habitsRow = (habitsToday[0] ?? {}) as Record<string, boolean | null>;
  const customDone = Object.fromEntries(customDoneRows.map(r => [r.habit_id, r.done]));

  const initialBalance = Number(balanceSetting[0]?.value ?? 0);
  const balance = initialBalance + budgetEntries.reduce(
    (s, e) => e.type === "income" ? s + Number(e.amount) : s - Number(e.amount), 0,
  );
  const monthlySpend = budgetEntries.filter(e => e.type === "expense")
    .reduce((s, e) => s + Number(e.amount), 0)
    + subs.filter(x => x.active).reduce((s, x) => s + Number(x.amount), 0);

  const prayersToday = Object.fromEntries(
    PRAYER_IDS.map(p => [p, !!habitsRow[p]])
  ) as Record<string, boolean>;

  // habits_list: every entry in habit_defs (the user's actual tracked list),
  // each annotated with today's completion.
  const habitsList = habitDefs.map(def => ({
    id: def.id,
    label: def.label,
    builtin: def.builtin,
    done: def.builtin
      ? !!habitsRow[def.id]
      : !!customDone[def.id],
  }));

  return {
    date: dt,
    time: now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }),
    tz,
    schedule,
    prayersToday,
    habitsList,
    todos,
    recentlyCompletedTodos,
    archivedTodos,
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
  const mark = (b: boolean) => b ? "✓" : "○";
  const prayersDone = PRAYER_IDS.filter(p => snap.prayersToday[p]).length;
  const tracked     = snap.habitsList.length;
  const habitsDone  = snap.habitsList.filter(h => h.done).length;

  const sections: string[] = [];

  sections.push(`# Now
- Date: ${snap.date} · local time ${snap.time} (${snap.tz})`);

  sections.push(`# Today's schedule (id → block)
${snap.schedule.length === 0 ? "(empty)" : snap.schedule.map(b =>
    `- [${b.id}] ${fmtMin(b.start_min)}–${fmtMin(b.end_min)} ${b.icon} ${b.label}`,
  ).join("\n")}`);

  sections.push(`# Today's habits
- Prayers (${prayersDone}/5): ${PRAYER_IDS.map(p => `${p}=${mark(snap.prayersToday[p])}`).join(" ")}
- Tracked habits (${habitsDone}/${tracked}): ${tracked === 0
    ? "(none configured)"
    : snap.habitsList.map(h => `${h.label}[${h.id}${h.builtin ? "*" : ""}]=${mark(h.done)}`).join(", ")}
  (* = builtin column; use mark_habit with the id for those, mark_custom_habit otherwise)`);

  // Kanban-grouped active todos
  const todoCol  = snap.todos.filter(t => t.status === "todo");
  const doingCol = snap.todos.filter(t => t.status === "doing");
  if (snap.todos.length > 0) {
    const fmt = (t: typeof snap.todos[number]) => {
      let due = "";
      if (t.due_at) {
        const d = new Date(t.due_at.replace(" ", "T"));
        const overdue = !isNaN(d.getTime()) && d.getTime() < Date.now();
        due = ` (due ${fmtDueTz(t.due_at, snap.tz)}${overdue ? " — OVERDUE" : ""})`;
      }
      return `- #${t.id} [${t.priority.toUpperCase()}] [${t.category}] ${t.text}${due}`;
    };
    const blocks: string[] = [`# Active todos (kanban)`];
    if (todoCol.length > 0)  blocks.push(`## To do (${todoCol.length})\n${todoCol.slice(0, 20).map(fmt).join("\n")}`);
    if (doingCol.length > 0) blocks.push(`## In progress (${doingCol.length})\n${doingCol.slice(0, 20).map(fmt).join("\n")}`);
    sections.push(blocks.join("\n"));
  } else {
    sections.push(`# Active todos: (none)`);
  }

  if (snap.recentlyCompletedTodos.length > 0) {
    sections.push(`# Recently completed todos (last 7 days)
${snap.recentlyCompletedTodos.slice(0, 10).map(t => `- #${t.id} [${t.category}] ${t.text} (${t.done_at.slice(0, 10)})`).join("\n")}`);
  }

  if (snap.archivedTodos.length > 0) {
    sections.push(`# Archived todos (off the board, still recoverable) — ${snap.archivedTodos.length}
${snap.archivedTodos.slice(0, 15).map(t => `- #${t.id} [${t.priority.toUpperCase()}] [${t.category}] ${t.text}`).join("\n")}`);
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
      if (n.locked) return `## #${n.id} ${n.title || "(untitled)"}\n🔒 [locked — content hidden]`;
      const text = htmlToText(n.content);
      const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
      return `## #${n.id} ${n.title || "(untitled)"}\n${snippet}`;
    }).join("\n\n")}`);
  }

  return sections.join("\n\n");
}

const fmtGB = (b: number) => `${(b / 1024 ** 3).toFixed(1)}G`;

/**
 * Compact "# Server" section for the system prompt. Always present so Claude
 * has situational awareness; full detail lives behind get_server_status.
 */
export function renderServerContext(s: ServerStatus): string {
  const lines: string[] = ["# Server (Hetzner box running kama.uz and all his other sites)"];

  lines.push(
    s.alerts.length === 0
      ? "- Alerts: none — all healthy"
      : `- ALERTS (${s.alerts.length}): ${s.alerts.map(a => `[${a.severity}] ${a.message}`).join("; ")}`,
  );

  if (s.host) {
    const memPct = Math.round((s.host.mem.used_b / Math.max(s.host.mem.total_b, 1)) * 100);
    const diskPct = Math.round((s.host.disk.used / Math.max(s.host.disk.total, 1)) * 100);
    const swapPct = s.host.swap.total_b > 0
      ? Math.round((s.host.swap.used_b / s.host.swap.total_b) * 100) : 0;
    lines.push(
      `- Host: CPU ${s.host.cpu_pct.toFixed(0)}% (load ${s.host.load[0]?.toFixed(2)}${s.host.cores ? `/${s.host.cores}` : ""}), ` +
      `RAM ${memPct}% (${fmtGB(s.host.mem.used_b)}/${fmtGB(s.host.mem.total_b)}), disk ${diskPct}%, ` +
      `swap ${swapPct}%, up ${Math.floor(s.host.uptime_s / 86400)}d`,
    );
  }

  const svcDown = s.services.filter(x => x.active === false);
  lines.push(`- Services: ${s.services.length - svcDown.length}/${s.services.length} active${
    svcDown.length ? ` — DOWN: ${svcDown.map(x => x.unit).join(", ")}` : ""}`);

  const domDown = s.domains.filter(x => x.ok === false);
  lines.push(`- Domains: ${s.domains.length - domDown.length}/${s.domains.length} ok${
    domDown.length ? ` — DOWN: ${domDown.map(x => `${x.host} (${x.error ?? "?"})`).join(", ")}` : ""}`);

  const bkStr = Object.entries(s.ops?.backups?.clusters ?? {})
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ver, b]) => `PG${ver} ${b.age_s == null ? "missing" : `${Math.floor(b.age_s / 3600)}h ago`}`)
    .join(", ");
  if (bkStr) lines.push(`- Backups: ${bkStr}`);

  const apt = s.ops?.apt;
  const jrn = s.ops?.journal;
  const f2b = s.ops?.fail2ban;
  const sec: string[] = [];
  if (apt) sec.push(`${apt.pending_security ?? "?"} security updates pending${apt.reboot_required ? ", REBOOT REQUIRED" : ""}`);
  if (f2b?.banned_now != null) sec.push(`fail2ban ${f2b.banned_now} banned`);
  if (jrn) {
    sec.push(`SSH logins 24h: ${jrn.ssh_accepted_24h}${jrn.ssh_last_ip ? ` (last ${jrn.ssh_last_ip})` : ""}`);
    sec.push(`OOM 24h: ${jrn.oom_kills_24h}`);
  }
  if (sec.length) lines.push(`- Security: ${sec.join("; ")}`);

  const va = s.ops?.vuln_audit;
  if (va?.critical != null) {
    lines.push(`- Deps audit: C=${va.critical} H=${va.high}${va.flagged?.length ? ` — ${va.flagged.join("; ")}` : ""}`);
  }

  lines.push("(Per-service/per-domain detail, SSL days, DB sizes — via the get_server_status tool.)");
  return lines.join("\n");
}

interface InboxPeek {
  new: number;
  recent: Array<{ source: string; kind: string; name: string | null; subject: string | null }>;
}

/** Cheap inbox summary for the system prompt: unread count + a few latest. */
async function getInboxPeek(): Promise<InboxPeek | null> {
  try {
    const [countRows, recent] = await Promise.all([
      query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM inbox_messages WHERE status = 'new'`),
      query<{ source: string; kind: string; name: string | null; subject: string | null }>(
        `SELECT source, kind, name, subject FROM inbox_messages
         WHERE status = 'new' ORDER BY created_at DESC LIMIT 5`,
      ),
    ]);
    return { new: Number(countRows[0]?.n ?? 0), recent };
  } catch {
    return null;
  }
}

/** Compact "# Inbox" section: only worth showing when something is unread. */
export function renderInboxContext(p: InboxPeek): string {
  if (p.new === 0) return "# Inbox\n- No new messages.";
  const items = p.recent
    .map(m => `${m.source} (${m.kind})${m.name ? ` from ${m.name}` : ""}${m.subject ? `: ${m.subject}` : ""}`)
    .join("; ");
  return `# Inbox\n- ${p.new} NEW message${p.new === 1 ? "" : "s"} from site contact/feedback forms: ${items}\n(Full text + older messages — via the get_inbox tool.)`;
}

const SYSTEM_INSTRUCTIONS = `You are Kamronbek's personal assistant living inside his private Telegram dashboard. You have full access to every part of his life via the structured snapshot below: schedule, habits, todos, job applications, budget, knowledge trees, methods (WOOP, goals, commitments), journal — and a live summary of his Hetzner server (the infra behind kama.uz and his other sites).

You also have TOOLS to MODIFY anything in his dashboard. Use them whenever he asks you to add, change, complete, or delete something — don't ask for permission for routine changes. After running a tool, briefly confirm in plain language what you did. For destructive operations on substantial data (deleting whole subjects/trees, deleting many applications), confirm first if intent is ambiguous.

Tool-use principles:
- Look up IDs from the snapshot (todos #N, applications #N, schedule [id], etc.).
- Todos live on a kanban board with three columns: "todo" / "doing" / "done". Moving a card = update_todo with the new status. Marking complete = complete_todo (auto-moves to "done").
- Tasks Kamronbek wants to keep but not actively work on (months-out items, on-hold ideas) go to the archive via archive_todo. They stay searchable in the snapshot but disappear from the board.
- Habits: prayers (fajr/dhuhr/asr/maghrib/isha) are always 5 fixed columns — use mark_habit. Other habits come from his habit_defs list (shown under "Tracked habits"); builtin ones (marked with *) also use mark_habit with their column id; non-builtin (custom) use mark_custom_habit with the habit_id string.
- If the user asks for something modified across multiple items, run multiple tool calls in sequence.
- get_server_status returns the full live infra picture (per-service, per-domain, SSL days, DB sizes, backups, security counters). The "# Server" section below is only a summary — call the tool when he asks for server/site details, and read its alerts list before declaring everything fine.
- get_inbox returns messages people sent through the contact/feedback forms on his sites. The "# Inbox" section below shows only the unread count and a peek — call the tool to read full message text, an email address to reply to, or older/archived messages.
- After tools succeed, summarise what you did. Don't dump tool output verbatim.
- If a tool fails, explain why; don't silently retry the same call.

Behaviour:
- He writes mostly in Russian. Match his language; reply in Russian unless he writes in English or Uzbek.
- Be direct, warm, and concise. He's 23, building software in London, working toward a software engineer role and broader self-mastery (math from first principles, methodical learning, deliberate practice). Treat him like a smart friend, not a help desk.
- Use the data below to ground every answer. Don't make stuff up — if the data doesn't say, say so.
- For learning questions, lean on the science he already trusts (active recall, spaced repetition, deliberate practice, WOOP, Locke-Latham, implementation intentions).
- Telegram renders standard Markdown (bold **like this**, italic *like this*, \`inline code\`, \`\`\`fenced code\`\`\`, [links](https://…)). Use it where it earns its keep — bolding a key name or value, fencing code/IDs/commands. Don't overdo headings or asterisk-bullets; prefer short paragraphs. For lists use plain "•" or numbers, not "- ".
- If asked something dangerous, illegal, or ethically off, decline briefly without lecturing.

His current data:`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function buildSystemPrompt(): Promise<string> {
  const [snap, server, inbox] = await Promise.all([
    getDashboardSnapshot(),
    // Server/inbox sections are best-effort: a hiccup must not kill the chat.
    getServerStatus().catch(() => null),
    getInboxPeek().catch(() => null),
  ]);
  const serverSection = server ? `\n\n${renderServerContext(server)}` : "";
  const inboxSection = inbox ? `\n\n${renderInboxContext(inbox)}` : "";
  return `${SYSTEM_INSTRUCTIONS}\n\n${renderContext(snap)}${serverSection}${inboxSection}`;
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
 *
 * `userMessage` is either a plain string (text-only turn) or a Claude
 * content-block array, which is how we feed in images and PDF documents
 * alongside a text question.
 *
 * Loops until the model emits an `end_turn` (no more tool calls) or hits
 * MAX_TOOL_ITERATIONS.
 */
export type UserMessageInput = string | Array<Anthropic.ContentBlockParam>;

export async function runChat(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: UserMessageInput,
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
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages,
      tools: TOOL_DEFINITIONS,
    });

    if (response.stop_reason === "max_tokens") {
      console.warn(
        `[anthropic] hit max_tokens (${MAX_OUTPUT_TOKENS}) before model finished. Tools may have been skipped.`
      );
    }

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
