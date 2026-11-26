# ThursdOps — Operations Cloud

A content-operations platform for the floral industry. ThursdOps runs the full
lifecycle of partner content: contracts and their deliverables, task planning,
submissions with a multi-stage approval flow, KPI tracking with QC, and a
self-service partner portal — all behind role-based dashboards.

**Live:** https://tanstack-start-app.thursdops.workers.dev

---

## Features

- **Contracts & deliverables** — per-partner agreements with deliverable quotas, rendered as cards with a completion view.
- **Task planner** — weekly buckets, assignments, priorities, duplicate/edit/delete, calendar & list views.
- **Submissions & approvals** — multi-file/link submissions; manager review → partner final approval, with a rework path.
- **KPI tracking + QC** — snapshot entry, a QC queue with partner/author filters, self-approval guard, per-partner visibility.
- **Partners & portal** — partner records, auto-provisioned logins, and a dedicated partner sign-in and dashboard.
- **Bulk import** — super-admin CSV importer (partners, users, contracts, tasks, partner requests) with validation, a dry-run preview, lenient "import incomplete" mode, and a verification queue.
- **Admin** — user management, activity log, database backups, customizable background theme, in-app confirm dialogs.
- **Auth & security** — Supabase Auth with Postgres Row-Level Security; a service-role client for trusted server operations only.

## Roles

`super_admin` · `manager` · `editor` · `ops_support` · `content_partner`
Staff sign in at `/login`; content partners at `/partner-login`.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) (SSR via Nitro) + React 19 |
| Build | Vite |
| Styling | Tailwind CSS v4 (CSS-first tokens) + shadcn/Radix UI |
| Backend | Supabase — Postgres, Auth, Row-Level Security |
| Server logic | `createServerFn` server functions with auth middleware |
| Hosting | Cloudflare Workers (via Wrangler) |

---

## Quick start (local)

Requires Node 20+, npm, and Docker (or Colima) for the local Supabase stack.

```bash
npm install
npx supabase start          # local Postgres + Auth on 127.0.0.1:54321
cp .env.example .env         # then fill with the values supabase start printed
npm run dev                  # http://localhost:8080
```

Demo accounts use the password `Demo2026!` (for example `arnold@thursd.com`, a
super-admin). **Rotate this before any real production use.**

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Production build (`.output/`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Environment variables

Configuration lives in `.env` (local), `.env.production` (build-time `VITE_*`),
and `wrangler.jsonc` (`vars`) + a Wrangler secret for the service-role key.
Every variable and where it's set is documented in **[HANDOVER.md](HANDOVER.md) §2**.
The `VITE_*` keys are baked into the browser bundle at build time; the
non-prefixed ones are read server-side at runtime. The `SUPABASE_SERVICE_ROLE_KEY`
is a **secret** — never committed, never shipped to the browser.

## Deploy (Cloudflare Workers)

```bash
npm run build
npx wrangler deploy          # needs `npx wrangler login`
```

## Project structure

```
src/
  routes/          # file-based routes (TanStack Router): /login, /admin/*, /manager/*, /partner/* …
  components/      # UI + feature components (app-shell, forms, dialogs, ui/ primitives)
  lib/             # *.functions.ts = server functions; auth, formatting, domain helpers
  integrations/
    supabase/      # typed client, auth middleware, server (service-role) client
supabase/
  migrations/      # Postgres schema as ordered migrations (source of truth)
handover/          # consolidated schema dump + handover artifacts
HANDOVER.md        # env vars, run/deploy, and database-handover steps
```

## Database

The schema is fully version-controlled in `supabase/migrations/`. Apply it to a
fresh project with `npx supabase db push`. A single consolidated copy is in
`handover/schema_all_migrations.sql`. See **HANDOVER.md §3** for transferring or
dumping the database.

---

_Built with TanStack Start. Internal operations tool — not for public distribution._
