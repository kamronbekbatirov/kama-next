import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

type UpNextKind = "todo" | "review" | "goal" | "job";
type Severity = "overdue" | "today" | "soon";

interface UpNextItem {
  kind: UpNextKind;
  id: string;
  text: string;
  sublabel?: string;
  severity: Severity;
}

interface OverviewStats {
  balance: number;
  monthlySpend: number;
  runwayDays: number | null;
  activeTodos: number;
  interviewsAndOffers: number;
  prayerStreak: number;
  habitStreak: number;
}

const SEVERITY_RANK: Record<Severity, number> = { overdue: 0, today: 1, soon: 2 };
const KIND_RANK: Record<UpNextKind, number> = { goal: 0, review: 1, job: 2, todo: 3 };

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export async function GET() {
  try {
    await auth();

    const [
      todos,
      reviews,
      goals,
      jobs,
      interviews,
      budgetEntries,
      subs,
      balanceSetting,
      defs,
      habitsRows,
      customCompletions,
    ] = await Promise.all([
      query<{ id: number; text: string; priority: string; category: string }>(
        `SELECT id, text, priority, category FROM todos
         WHERE done = FALSE AND priority = 'high'
         ORDER BY created_at DESC LIMIT 6`
      ),
      query<{ id: number; title: string; subject_title: string; next_review: string }>(
        `SELECT n.id, n.title, s.title AS subject_title, n.next_review::text
         FROM learn_nodes n JOIN learn_subjects s ON s.id = n.subject_id
         WHERE n.next_review IS NOT NULL AND n.next_review <= NOW() + INTERVAL '7 days'
         ORDER BY n.next_review ASC LIMIT 6`
      ),
      query<{ id: number; title: string | null; data: Record<string, string | undefined> }>(
        `SELECT id, title, data FROM learn_methods
         WHERE method = 'goal' AND active = TRUE`
      ),
      query<{ id: number; company: string; role: string; status: string }>(
        `SELECT id, company, role, status FROM applications
         WHERE status IN ('interview','offer')
         ORDER BY created_at DESC LIMIT 6`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM applications WHERE status IN ('interview','offer')`
      ),
      query<{ type: string; amount: number }>(
        `SELECT type, amount::float AS amount FROM budget_entries`
      ),
      query<{ amount: number; active: boolean }>(
        `SELECT amount::float AS amount, active FROM subscriptions`
      ),
      query<{ value: number | string }>(
        `SELECT value FROM settings WHERE key = 'initial_balance'`
      ),
      query<{ id: string; label: string; builtin: boolean }>(
        `SELECT id, label, builtin FROM habit_defs ORDER BY builtin DESC, position ASC`
      ),
      query<Record<string, boolean | string>>(
        `SELECT * FROM habits WHERE date >= CURRENT_DATE - 30::int ORDER BY date ASC`
      ),
      query<{ date: string; habit_id: string; done: boolean }>(
        `SELECT date::text AS date, habit_id, done FROM habit_custom_completions
         WHERE date >= CURRENT_DATE - 30::int`
      ),
    ]);

    const upNext: UpNextItem[] = [];

    for (const t of todos) {
      upNext.push({
        kind: "todo",
        id: `todo:${t.id}`,
        text: t.text,
        sublabel: t.category,
        severity: "today",
      });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    for (const r of reviews) {
      const reviewDate = r.next_review.slice(0, 10);
      const severity: Severity =
        reviewDate < todayIso ? "overdue" : reviewDate === todayIso ? "today" : "soon";
      upNext.push({
        kind: "review",
        id: `review:${r.id}`,
        text: r.title,
        sublabel: r.subject_title,
        severity,
      });
    }

    for (const g of goals) {
      const deadline = g.data?.deadline;
      if (!deadline) continue;
      const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
      if (days > 7) continue;
      const severity: Severity = days < 0 ? "overdue" : days === 0 ? "today" : "soon";
      upNext.push({
        kind: "goal",
        id: `goal:${g.id}`,
        text: g.title || g.data?.what || "Goal",
        sublabel: days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d`,
        severity,
      });
    }

    for (const j of jobs) {
      upNext.push({
        kind: "job",
        id: `job:${j.id}`,
        text: `${j.company} · ${j.role}`,
        sublabel: j.status,
        severity: j.status === "offer" ? "today" : "soon",
      });
    }

    upNext.sort((a, b) => {
      if (a.severity !== b.severity) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    });
    const upNextCapped = upNext.slice(0, 6);

    const initialBalance = Number(balanceSetting[0]?.value ?? 0);
    const balance = initialBalance + budgetEntries.reduce(
      (s, e) => e.type === "income" ? s + Number(e.amount) : s - Number(e.amount), 0,
    );
    const monthlySpend = budgetEntries
      .filter(e => e.type === "expense")
      .reduce((s, e) => s + Number(e.amount), 0)
      + subs.filter(x => x.active).reduce((s, x) => s + Number(x.amount), 0);
    const runwayDays = monthlySpend > 0 ? Math.floor((balance / monthlySpend) * 30) : null;

    const activeTodosRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM todos WHERE done = FALSE`
    );
    const activeTodos = Number(activeTodosRow[0]?.count ?? 0);
    const interviewsAndOffers = Number(interviews[0]?.count ?? 0);

    // Streaks: walk backwards from today over the last 30 days
    const days = lastNDays(30);
    const habitsByDate = new Map<string, Record<string, boolean | string>>();
    for (const h of habitsRows) {
      const dt = String(h.date).slice(0, 10);
      habitsByDate.set(dt, h);
    }
    const customByKey = new Map<string, boolean>();
    for (const c of customCompletions) {
      customByKey.set(`${c.date}::${c.habit_id}`, !!c.done);
    }

    const allPrayersDone = (date: string): boolean => {
      const row = habitsByDate.get(date) as Record<string, boolean> | undefined;
      if (!row) return false;
      return PRAYER_KEYS.every(k => !!row[k]);
    };

    const isHabitDone = (habitId: string, isBuiltin: boolean, date: string): boolean => {
      if (isBuiltin) {
        const row = habitsByDate.get(date) as Record<string, boolean> | undefined;
        return !!row?.[habitId];
      }
      return !!customByKey.get(`${date}::${habitId}`);
    };

    const allHabitsDone = (date: string): boolean => {
      if (defs.length === 0) return false;
      return defs.every(def => isHabitDone(def.id, def.builtin, date));
    };

    const computeStreak = (predicate: (date: string) => boolean): number => {
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        if (predicate(days[i])) streak++;
        else break;
      }
      return streak;
    };

    const stats: OverviewStats = {
      balance,
      monthlySpend,
      runwayDays,
      activeTodos,
      interviewsAndOffers,
      prayerStreak: computeStreak(allPrayersDone),
      habitStreak: defs.length > 0 ? computeStreak(allHabitsDone) : 0,
    };

    return Response.json({ upNext: upNextCapped, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("today-overview route error:", msg);
    return Response.json({ error: "server", detail: msg }, { status: 500 });
  }
}
