# kama.uz — Personal Site & AI-Driven Dashboard

The full source for [kama.uz](https://kama.uz): a bilingual personal site with a Resend-backed contact form on the public side, and a private Telegram-authenticated dashboard on the inside that I run my entire week through — habits, learning, todos, budget, subscriptions, applications, journal, notes — with Claude available as a first-class operator that can edit any of those modules through tool calls.

[![Live](https://img.shields.io/badge/live-kama.uz-000?style=flat-square)](https://kama.uz)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## Two surfaces, one codebase

### 1. Public site — `/`
A bilingual (English / Russian) portfolio page with system-aware theming. The contact form posts to `/api/contact` and goes out via Resend. Inbound replies come back through `/api/inbound` (a Resend webhook), are fetched via the Resend Emails API, and forwarded to a personal mailbox.

### 2. Mini-app — `/miniapp`
A private dashboard. Every byte of state lives in PostgreSQL — the previous version stored everything in `localStorage`, which broke as soon as I switched device. Authentication is dual-mode:

- **Telegram WebApp `initData`** — when launched inside Telegram, the cookie is set after HMAC-verifying the init payload against the bot token. Only the configured `OWNER_TELEGRAM_ID` can sign in.
- **Password fallback** — for desktop browsers, the dashboard accepts `DASHBOARD_PASSWORD` once and signs an `iron-session`-style cookie.

#### Modules

| Module | Path | What it does |
| --- | --- | --- |
| **Today** | `today-tab.tsx` | The day's habits + scheduled time blocks, both as a single glanceable view. |
| **Tasks** | `tasks-tab.tsx` | Lightweight todos with category (`general`, `visa`, `job`, `learning`, `personal`) and priority. |
| **Jobs** | `jobs-tab.tsx` | Job-application pipeline: company, role, status, dates, notes. |
| **Budget** | `budget-tab.tsx` | Income/expense ledger with categories on top of a configurable `initial_balance`. |
| **Journal** | `journal-tab.tsx` | Daily log entries. |
| **Learn** | `_components/learn/` | The learning hub — a tree of subjects → nodes with status (`not_started`, `learning`, `reviewing`, `mastered`), spaced-repetition reviews (`next_review`, `ease_factor`, `interval_days`), and recall sessions with 1-5 grading. Implements the SM-2 algorithm in `src/lib/learn/spaced-repetition.ts`. |
| **Methods** | `_components/learn/methods.tsx` | Personal catalogue of learning techniques and protocols. |
| **Settings** | `settings-modal.tsx` | Schedule blocks, habit definitions, subscriptions. |

### 3. The Claude coupling — `/api/telegram/webhook`
Claude is wired in as a tool-using agent over Telegram. The webhook validates `TELEGRAM_WEBHOOK_SECRET`, gates the sender by `OWNER_TELEGRAM_ID`, and runs the message through `runChat()` with **39 tool definitions** that map directly onto every dashboard mutation:

```
add_todo, complete_todo, uncomplete_todo, update_todo, delete_todo,
add_schedule_block, update_schedule_block, delete_schedule_block, reset_schedule,
mark_habit, mark_custom_habit, add_custom_habit, rename_custom_habit, delete_custom_habit,
add_application, update_application, delete_application,
add_budget_entry, delete_budget_entry, set_initial_balance,
add_subscription, update_subscription, delete_subscription,
save_journal_log,
add_note, update_note, delete_note,
add_learn_subject, update_learn_subject, delete_learn_subject,
add_learn_node, update_learn_node, delete_learn_node,
log_recall_session,
add_method_entry, update_method_entry, delete_method_entry
```

The full conversation history (with token usage and prompt-cache stats) is persisted in `telegram_messages`, so Claude has multi-day context across chats.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, `output: 'standalone'`) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, shadcn-style primitives, `next-themes` |
| Database | PostgreSQL 16 via the [`pg`](https://www.npmjs.com/package/pg) pool |
| Auth | Custom HMAC-SHA256 signed cookies (Edge-runtime safe), Telegram WebApp `initData` verification |
| AI | `@anthropic-ai/sdk`, Claude Opus 4.7 by default, prompt caching on |
| Email | Resend (outbound transactional + inbound webhook) |
| Icons | `lucide-react` |

## Getting started

Prerequisites: Node.js 20+, PostgreSQL 14+, optional Telegram bot, optional Anthropic & Resend keys.

```bash
git clone https://github.com/kamronbekbatirov/kama-next.git
cd kama-next
cp .env.example .env.local           # fill in real values
npm install
psql "$DATABASE_URL" -f migrations/001_learn.sql
psql "$DATABASE_URL" -f migrations/002_dashboard_db.sql
npm run dev
```

Public site at <http://localhost:3000>, dashboard at <http://localhost:3000/miniapp>.

## Configuration

Every environment variable is **required**: the app refuses to boot without `SESSION_SECRET` and `DASHBOARD_PASSWORD`. The complete list lives in [`.env.example`](.env.example):

- `SESSION_SECRET` — 32+ random characters. `openssl rand -hex 32` is fine.
- `DATABASE_URL` — PostgreSQL connection string.
- `DASHBOARD_PASSWORD` — desktop fallback for `/miniapp/login`.
- `TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_ID` — only this Telegram user can sign in.
- `TELEGRAM_WEBHOOK_SECRET` — appended to the webhook URL so the app can reject forged callbacks.
- `RESEND_API_KEY` — outbound contact form + inbound webhook authentication.
- `ANTHROPIC_API_KEY` — required for the Telegram chat assistant.
- `ANTHROPIC_MODEL` — optional override; defaults to `claude-opus-4-7`.

## Database

```
migrations/
├── 001_learn.sql           Learning Hub: subjects, nodes, sessions
└── 002_dashboard_db.sql    Settings, schedule_blocks, habit_defs,
                            habit_custom_completions, subscriptions,
                            telegram_messages, …
```

Apply them in order against an empty database. The migrations are idempotent — re-running them on an existing DB is safe (every `CREATE TABLE` uses `IF NOT EXISTS`).

## Production

`npm run build` produces a self-contained `.next/standalone/server.js` plus copied `static/` and `public/` directories. The reference systemd unit binds to `127.0.0.1:3010` behind Caddy:

```caddy
kama.uz, www.kama.uz {
    @noindex path /miniapp /miniapp/* /api /api/*
    header @noindex X-Robots-Tag "noindex, nofollow, noarchive"
    reverse_proxy 127.0.0.1:3010
}
```

The `X-Robots-Tag` rule keeps the dashboard out of search results even though the routes themselves are auth-gated.

## Project layout

```
src/
├── app/
│   ├── page.tsx              Public site (bilingual portfolio + contact form)
│   ├── api/
│   │   ├── auth/             { login, logout, me, tg }  — login routes
│   │   ├── contact/          POST contact form → Resend
│   │   ├── inbound/          Resend inbound webhook → forward email
│   │   ├── telegram/webhook/ Telegram bot webhook (Claude-driven)
│   │   └── dashboard/        24 endpoints, one per module
│   ├── miniapp/
│   │   ├── login/            Password / Telegram login
│   │   └── _components/      Today, Tasks, Jobs, Budget, Journal, Learn, Methods
│   ├── robots.ts, sitemap.ts
│   └── layout.tsx, globals.css
├── components/               lang-toggle, theme-toggle, providers, ui/
├── lib/
│   ├── auth.ts               HMAC-signed session cookies
│   ├── db.ts                 pg pool + query helper
│   ├── anthropic.ts          Claude wrapper with prompt caching
│   ├── anthropic-tools.ts    39 tool definitions → DB mutations
│   ├── telegram.ts           sendMessage / sendChatAction / truncate
│   ├── learn/                Spaced-repetition engine (SM-2)
│   ├── i18n.ts               EN/RU dictionary for the public site
│   └── utils.ts
└── middleware.ts             /miniapp/* gate — redirect unauthenticated to /login
migrations/                   Forward-only SQL migrations
public/                       Icons + apple-touch-icon
```

## Notes

- This repo evolves with my actual workflow. The version on `main` reflects whatever I'm currently using.
- The dashboard is single-tenant by design — there is exactly one user, identified by `OWNER_TELEGRAM_ID`.
- The Anthropic tool-use loop has built-in safety checks: every mutation prints back the affected row IDs so the model can self-verify the result.

## License

Released under the [MIT License](LICENSE).
