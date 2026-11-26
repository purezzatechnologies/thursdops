# ThursdOps — Handover

Floral-industry content-operations platform.
**Stack:** TanStack Start (SSR, Nitro) · React 19 · Vite · Tailwind v4 · shadcn/Radix · Supabase (Postgres + Auth + RLS) · deployed on Cloudflare Workers.

**Live app:** https://tanstack-start-app.thursdops.workers.dev
**Supabase project ref (current):** `rjiugsmjxdwcyokzwgyr`

---

## 1. Repository

Source is plain Node/Vite — nothing proprietary. To hand it over:

```bash
# from the project root
git init
git add .
git commit -m "ThursdOps handover: full source"
git branch -M main
git remote add origin git@github.com:<CLIENT_ORG>/<REPO>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.env`, `.output`, `.wrangler`, `.dev.vars` — so **no secrets are committed**. Everything needed to build is in-tree (including `supabase/migrations/`).

> Note on history: the local copy is not currently a git repo, so the push above starts
> history at the handover commit. If the project was originally built on Lovable with GitHub
> sync, the full commit history already lives in that connected GitHub repo — transferring or
> forking **that** repo is how the client gets the complete history.

---

## 2. Environment variables

There are **three** places configuration lives. All `SUPABASE_*` values come from
**Supabase dashboard → Settings → API** of whichever project is in use.

| Variable | Where it's set | Public? | What it does |
|---|---|---|---|
| `SUPABASE_URL` | Wrangler `vars` (prod) · `.env` (local) | public | Supabase REST/Auth base URL used by **server** code. |
| `SUPABASE_PUBLISHABLE_KEY` | Wrangler `vars` (prod) · `.env` (local) | public (anon) | Anon key the server uses for the user-scoped (RLS-enforced) client. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Wrangler secret** (prod) · `.env` (local) | **SECRET** | Service-role key — **bypasses RLS**, used only in server functions for admin ops. Never ships to the browser; never commit it. |
| `VITE_SUPABASE_URL` | `.env.production` (build) · `.env` (local) | public | Same URL, **baked into the browser bundle** at build time. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.production` (build) · `.env` (local) | public (anon) | Anon key **baked into the browser bundle** for the client-side Supabase client. |

Key points:
- **`VITE_*` = build-time** (compiled into the client JS by `npm run build`). The non-prefixed ones = **runtime, server-side** (read from `process.env`, populated by Wrangler on Cloudflare).
- Both sets must point at the **same** Supabase project.
- The service-role key is set once with `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` and is **not** in any file.
- `.env.example` documents the local setup; `wrangler.jsonc` holds the public prod `vars`.

**After the client takes over Supabase**, they update: `.env.production` (both `VITE_*`),
`wrangler.jsonc` `vars` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`), and re-set the
`SUPABASE_SERVICE_ROLE_KEY` secret — all with their own project's values.

---

## 3. Supabase (schema + data)

**Schema** is fully version-controlled in `supabase/migrations/` (25 migrations). A single
concatenated copy is at `handover/schema_all_migrations.sql`. Nothing else defines the schema.

Two ways to hand over the database — pick one:

**A) Transfer the project (easiest — moves schema + data + auth users):**
Supabase dashboard → the project → **Settings → General → Transfer project** → choose the
client's organization. The project ref/URL stay the same, so the live Worker keeps working;
only ownership/billing moves.

**B) Dump + restore into the client's own project:**
```bash
# Schema (or just hand over supabase/migrations/)
npx supabase db dump --linked -f handover/schema.sql
# Data only
npx supabase db dump --linked --data-only -f handover/data.sql
# Auth users live in the auth schema:
npx supabase db dump --linked --schema auth -f handover/auth.sql
```
(These prompt for the **database password** — dashboard → Settings → Database. The client then
`psql`-restores them, or runs `supabase db push` with the migrations, into their new project.)

> The client should create their own Supabase project, point the env vars at it (section 2),
> then either `supabase db push` the migrations or restore the dumps.

---

## 4. Run & deploy

**Local dev** (needs Docker/Colima):
```bash
npm install
npx supabase start          # local Postgres + Auth on 127.0.0.1:54321
npm run dev                 # app on http://localhost:8080
```

**Deploy to Cloudflare Workers:**
```bash
npm run build
npx wrangler deploy
```
Requires a Cloudflare account (`npx wrangler login`). The Worker name is `tanstack-start-app`
(`wrangler.jsonc`). To move it to the client's Cloudflare account, they log in with their own
account and deploy; update `name` if they want a different subdomain.

---

## 5. Accounts / access

Demo accounts all use the password **`Demo2026!`** — a shared demo password.
**Rotate it before real production use.** The bulk-import tool also defaults new logins to it.
Roles: `super_admin`, `manager`, `editor`, `ops_support`, `content_partner`.
Partners sign in at `/partner-login`; everyone else at `/login`.

---

## 6. Handover checklist

- [ ] Push repo to the client's GitHub (section 1) — or transfer the Lovable-connected repo for full history.
- [ ] Transfer the Supabase project **or** hand over dumps (section 3).
- [ ] Client creates their Cloudflare account and redeploys, or you transfer the Worker.
- [ ] Client sets all env vars to their own Supabase/Cloudflare values (section 2).
- [ ] Rotate the shared demo password (section 5).
- [ ] 30-min walkthrough call — this doc is the agenda.
