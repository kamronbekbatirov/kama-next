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

## License

[MIT](LICENSE)
