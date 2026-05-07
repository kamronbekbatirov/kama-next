# kama.uz — A personal site you can talk to

> **My personal portfolio out front. The OS I run my whole life on, behind the login. And Claude has the keys.**

[kama.uz](https://kama.uz) is two products on one codebase. The public side is a bilingual portfolio with a working contact form. The private side is a personal dashboard I open every morning — habits, learning, todos, budget, subscriptions, job applications, journal, notes — and Claude is plugged into it as a first-class operator over Telegram. I send a message like *"add 'pay rent' for tomorrow and mark today's reading habit done"*, and Claude actually does it: it has 39 tool definitions, one for every action my dashboard can perform.

[![Live](https://img.shields.io/badge/live-kama.uz-000?style=flat-square)](https://kama.uz)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Claude](https://img.shields.io/badge/Powered%20by-Claude-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://www.anthropic.com)

---

## Two surfaces

### 🌐 Public — `/`
A bilingual (EN / RU) portfolio with system-aware theming. The contact form goes out via [Resend](https://resend.com); replies come back through a Resend webhook and forward to a personal mailbox.

### 🔒 Private — `/miniapp`
A personal dashboard. Every byte of state lives in PostgreSQL — the previous version stored everything in `localStorage`, which broke the moment I switched device. Auth is dual-mode:

- **Telegram WebApp** — open the dashboard inside Telegram and the cookie is signed after HMAC-verifying `initData` against the bot token. Only one Telegram ID can sign in.
- **Password** — for desktop browsers, type the dashboard password once.

#### What's in the dashboard

| Module | What it's for |
| --- | --- |
| 📅 **Today** | Today's habits + scheduled time blocks, in one glance |
| ✅ **Tasks** | Lightweight todos, categorised |
| 💼 **Jobs** | Job-application pipeline — company, role, status, dates |
| 💰 **Budget** | Income / expense ledger over a starting balance |
| 📓 **Journal** | Daily log entries |
| 🧠 **Learn** | Subjects → nodes → spaced-repetition recall, full SM-2 algorithm |
| 🔬 **Methods** | Personal catalogue of learning techniques |
| ⚙️ **Settings** | Schedule blocks, habits, subscriptions |

## The Claude coupling

Telegram → my bot → `/api/telegram/webhook` → Claude with **39 tools**, each one mapping onto a single dashboard mutation:

```
add_todo            mark_habit          add_application       add_budget_entry
complete_todo       mark_custom_habit   update_application    delete_budget_entry
update_todo         add_custom_habit    delete_application    set_initial_balance
delete_todo         delete_custom_habit
                                        add_subscription      save_journal_log
add_schedule_block  add_note            update_subscription   add_learn_subject
update_schedule_..  update_note         delete_subscription   update_learn_subject
delete_schedule_..  delete_note                               delete_learn_subject
reset_schedule                                                add_learn_node
                    add_method_entry    log_recall_session    update_learn_node
                    update_method_entry                       delete_learn_node
                    delete_method_entry
```

Conversation history (with token + prompt-cache stats) lives in `telegram_messages`, so Claude has multi-day context across chats.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, `output: 'standalone'`) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, shadcn-style primitives |
| Database | PostgreSQL 16 via the `pg` pool |
| Auth | Custom HMAC-SHA256 signed cookies (Edge-safe) + Telegram `initData` |
| AI | Anthropic SDK · Claude Opus 4.7 · prompt caching on |
| Email | Resend (outbound + inbound webhook) |

## Run it locally

Prerequisites: Node 20+, Postgres 14+, optional Telegram bot, optional Anthropic + Resend keys.

```bash
git clone https://github.com/kamronbekbatirov/kama-next.git
cd kama-next
cp .env.example .env.local
npm install
psql "$DATABASE_URL" -f migrations/001_learn.sql
psql "$DATABASE_URL" -f migrations/002_dashboard_db.sql
npm run dev
```

- Public site → <http://localhost:3000>
- Dashboard → <http://localhost:3000/miniapp>

## Notes

- Single-tenant by design — there's exactly one user, identified by `OWNER_TELEGRAM_ID`.
- Migrations are idempotent. Re-running them on a populated DB is safe.
- The Anthropic tool-use loop self-verifies — every mutation echoes the affected row IDs back to the model.

---

## For contributors / AI agents

> ⚠️ **Read this before writing any code.** This project pins **Next.js 16**, which has breaking changes vs. anything in your training data. APIs, conventions, and file structure may all differ from older Next.js. When in doubt, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.

### Mental model
A **single-tenant** personal app for one user (identified by `OWNER_TELEGRAM_ID`). The frontend is split into a public marketing page at `/` and a private dashboard at `/miniapp` that's auth-gated by `middleware.ts`. The backend is a thin layer of route handlers under `src/app/api/` that all talk to a shared Postgres database via the `pg` pool in `src/lib/db.ts`. The Anthropic tool-use loop in `src/lib/anthropic-tools.ts` is the highest-leverage code in the repo — every dashboard mutation also exists as a Claude tool, so the bot can do anything the UI can.

### Project tree

```
src/
├── app/
│   ├── page.tsx                     Public bilingual portfolio + contact form
│   ├── layout.tsx · globals.css
│   ├── robots.ts · sitemap.ts
│   ├── api/
│   │   ├── auth/                    login, logout, me, tg (Telegram WebApp init verify)
│   │   ├── contact/                 POST contact form → Resend
│   │   ├── inbound/                 Resend webhook → forward inbound mail
│   │   ├── telegram/webhook/        Telegram bot webhook (Claude-driven)
│   │   └── dashboard/               24 endpoints — one per module
│   │       ├── todos/ · habits/ · habit-defs/ · habit-custom/
│   │       ├── schedule/ · settings/ · subscriptions/
│   │       ├── budget/ · applications/ · log/ · history/
│   │       ├── notes/ · learn/
│   └── miniapp/
│       ├── login/                   Password / Telegram login
│       └── _components/
│           ├── today-tab.tsx · tasks-tab.tsx · jobs-tab.tsx
│           ├── budget-tab.tsx · journal-tab.tsx
│           ├── settings-modal.tsx
│           └── learn/               Learning hub (subjects, nodes, sessions)
├── components/                      lang-toggle, theme-toggle, providers, ui/
├── lib/
│   ├── auth.ts                      HMAC-SHA256 signed session cookies (Edge-safe)
│   ├── db.ts                        pg pool + helpers · single point of DB access
│   ├── anthropic.ts                 Claude wrapper · prompt caching enabled
│   ├── anthropic-tools.ts           39 tool definitions → DB mutations
│   ├── telegram.ts                  sendMessage / sendChatAction / truncate
│   ├── learn/                       Spaced-repetition engine (SM-2)
│   │   └── spaced-repetition.ts     interval/ease/next_review math
│   ├── i18n.ts                      EN/RU dictionary for the public site only
│   └── utils.ts
└── middleware.ts                    /miniapp/* gate — redirects unauth → /login

migrations/                          Forward-only SQL migrations
├── 001_learn.sql                    subjects · nodes · recall_sessions
└── 002_dashboard_db.sql             todos · habits · schedule · subscriptions
                                     · budget · journal · applications · notes
                                     · telegram_messages

public/                              Icons + apple-touch-icon
```

### Where things live

| You want to … | Open … |
| --- | --- |
| Add a new dashboard module | (1) SQL migration in `migrations/`; (2) endpoint group in `src/app/api/dashboard/<module>/route.ts`; (3) tab component in `src/app/miniapp/_components/<module>-tab.tsx`; (4) wire into the tab nav |
| Expose a new operation to Claude/Telegram | A new tool in `src/lib/anthropic-tools.ts` — define `name`, `description`, `input_schema`, then implement the handler that runs the same SQL the API endpoint does |
| Tune Claude prompts or model | `src/lib/anthropic.ts` (`runChat()`, system prompt) and the `ANTHROPIC_MODEL` env var |
| Change the spaced-repetition algorithm | `src/lib/learn/spaced-repetition.ts` |
| Add a new locale to the public site | `src/lib/i18n.ts` (the dictionary is in code) |
| Touch auth | `src/lib/auth.ts` (cookie signing) and `src/middleware.ts` (route gating). Telegram `initData` HMAC is in `src/app/api/auth/tg/route.ts`. |
| Add a public-site section | A component in `src/components/`, then compose it in `src/app/page.tsx` |

### Conventions and gotchas

- ⚠️ **Next.js 16 (NOT 15 or 14).** `await params`, async server components everywhere, new caching defaults. If a pattern from older Next.js breaks, that's why. Read `node_modules/next/dist/docs/` for the relevant feature.
- ⚠️ **Single-tenant.** There is exactly one user — `OWNER_TELEGRAM_ID`. Every API endpoint should refuse other Telegram IDs. Don't add multi-tenant code paths.
- ⚠️ **Two auth flows, one cookie.** Password login and Telegram WebApp initData both produce the same `iron-session`-style cookie via `src/lib/auth.ts`. Add new flows on top of this — don't introduce a parallel session.
- ⚠️ **Tool-use parity.** Whenever you add a dashboard mutation, also add a matching tool in `anthropic-tools.ts`. Otherwise Claude can read but not write that module — and that breaks the "operate by chat" promise.
- ⚠️ **Prompt caching is on.** The system prompt + tool list is sent with `cache_control: ephemeral`. Don't break the cache by inlining variable content into the system block; put per-conversation context in `messages` instead.
- ⚠️ **Edge-runtime auth.** `middleware.ts` runs on the Edge runtime — `src/lib/auth.ts` therefore uses Web Crypto's `crypto.subtle`, not Node's `crypto`. Don't import Node-only modules into auth code.
- **Migrations are idempotent and forward-only.** Every `CREATE TABLE` uses `IF NOT EXISTS`. Re-running them on an existing DB is safe. There are no down migrations.
- **Postgres `pg` pool, not Prisma.** Raw SQL throughout `src/lib/db.ts` and the route handlers. Don't introduce an ORM.
- **`telegram_messages` is the canonical chat log.** It stores user/assistant turns *and* token + cache stats per turn. The Claude conversation history loaded into `runChat()` comes from this table, not from any in-memory store.
- **Reverse-proxy hardening required.** Production binds to `127.0.0.1:3010`. `X-Robots-Tag: noindex` is set by Caddy on `/miniapp/*` and `/api/*` so the dashboard never appears in search results — keep this rule in any new deployment config.
- **`@AGENTS.md` import in `CLAUDE.md`.** Claude Code reads both. Keep `AGENTS.md` minimal and current — its main job is to scream about the Next.js 16 gotcha.

### Run / build / deploy

```bash
cp .env.example .env.local           # SESSION_SECRET, DATABASE_URL,
                                     # DASHBOARD_PASSWORD, TELEGRAM_*,
                                     # ANTHROPIC_API_KEY, RESEND_API_KEY
npm install
psql "$DATABASE_URL" -f migrations/001_learn.sql
psql "$DATABASE_URL" -f migrations/002_dashboard_db.sql
npm run dev                          # :3000  (public at /, dashboard at /miniapp)
npm run build && npm start           # production: standalone server.js on :3010
```

The Telegram webhook URL must be `https://kama.uz/api/telegram/webhook?secret=$TELEGRAM_WEBHOOK_SECRET`. Set it once via `setWebhook` after first deploy.

## License

[MIT](LICENSE)
