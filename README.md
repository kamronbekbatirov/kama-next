# kama.uz — Personal Site & Dashboard

The source code behind [kama.uz](https://kama.uz): a personal portfolio, a contact endpoint that pipes through [Resend](https://resend.com), and a private Telegram-authenticated mini-app that hosts my daily dashboard — habits, learning hub, todos, budget, subscriptions, application tracker, and notes — all backed by PostgreSQL and powered by Claude where it makes sense.

[![Live](https://img.shields.io/badge/live-kama.uz-000?style=flat-square)](https://kama.uz)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## What's inside

The repository is one Next.js application with two distinct surfaces:

### 1. Public site (`/`)
A bilingual (English / Russian) portfolio page with theming, typography, and a Resend-backed contact form. Inbound replies flow back through `/api/inbound` and forward to a personal mailbox.

### 2. Telegram mini-app (`/miniapp`)
A private dashboard, accessible only to a single Telegram user, with the following modules:

| Module | Purpose |
| --- | --- |
| **Habits** | Custom habit definitions, daily check-ins, streaks. |
| **Learning Hub** | Hierarchical subjects, nodes, and progress tracking; Claude can suggest next steps. |
| **Todos** | Lightweight task list with priorities. |
| **Budget** | Expense and income log with categories. |
| **Subscriptions** | Tracker for recurring charges with renewal reminders. |
| **Applications** | Job-application pipeline (status, dates, notes). |
| **Schedule** | Calendar view across the dashboard data. |
| **Notes** | Free-form notes. |
| **History / Log** | Audit trail of dashboard actions. |

Authentication is dual-mode: Telegram WebApp `initData` verification (HMAC against the bot token) for in-app sessions, with a password fallback for desktop browsers. Sessions are signed cookies — no third-party identity provider is involved.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5 |
| UI | React 19, shadcn/ui, Tailwind CSS 4 |
| Database | PostgreSQL via [`pg`](https://www.npmjs.com/package/pg) |
| Auth | `iron-session` + custom HMAC for Telegram WebApp |
| AI | `@anthropic-ai/sdk` (Claude Opus 4.7 by default) |
| Email | Resend (outbound transactional + inbound webhook) |
| Theme | `next-themes` |

## Getting started

```bash
git clone https://github.com/kamronbekbatirov/kama-next.git
cd kama-next
cp .env.example .env.local
# fill in the values (see Configuration below)
npm install
psql "$DATABASE_URL" -f migrations/001_learn.sql
psql "$DATABASE_URL" -f migrations/002_dashboard_db.sql
npm run dev
```

The dev server runs at <http://localhost:3000>. The mini-app is at <http://localhost:3000/miniapp>.

## Configuration

All secrets are required and have **no fallbacks** — the app refuses to start without them. See [`.env.example`](.env.example) for the full list. Highlights:

- `SESSION_SECRET` — 32+ random characters. `openssl rand -hex 32` is fine.
- `DATABASE_URL` — PostgreSQL connection string.
- `DASHBOARD_PASSWORD` — password fallback for the mini-app login.
- `TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_ID` — only this user can sign in via Telegram.
- `TELEGRAM_WEBHOOK_SECRET` — added to the Telegram webhook URL so the app can reject forged callbacks.
- `RESEND_API_KEY` — outbound mail (contact form, notifications).
- `ANTHROPIC_API_KEY` — Claude API key for Learning Hub helpers.

## Database

Two migration files in `migrations/`:

- `001_learn.sql` — Learning Hub: subjects, nodes, progress.
- `002_dashboard_db.sql` — habits, todos, applications, budget, subscriptions, schedule, notes.

Run them in order against an empty database:

```bash
psql "$DATABASE_URL" -f migrations/001_learn.sql
psql "$DATABASE_URL" -f migrations/002_dashboard_db.sql
```

## Production

`npm run build` produces `.next/standalone/server.js` ready for any Node 20+ environment. The provided systemd unit (not in this repo) runs the server bound to `127.0.0.1` behind Caddy with TLS termination.

A typical reverse proxy snippet:

```caddy
kama.uz, www.kama.uz {
    @noindex path /miniapp /miniapp/* /api /api/*
    header @noindex X-Robots-Tag "noindex, nofollow, noarchive"
    reverse_proxy 127.0.0.1:3010
}
```

## Project layout

```
src/
├── app/
│   ├── (public site)        # /, contact form, sitemap, robots
│   ├── api/
│   │   ├── auth/            # Telegram auth + password login
│   │   ├── contact/         # Resend outbound
│   │   ├── inbound/         # Resend inbound webhook
│   │   ├── telegram/        # Telegram bot webhook
│   │   └── dashboard/       # All mini-app endpoints
│   └── miniapp/             # Authenticated dashboard UI
├── components/              # Shared UI + providers
└── lib/                     # auth, db pool, anthropic, telegram, i18n
migrations/                  # SQL schema
```

## License

Released under the [MIT License](LICENSE).
