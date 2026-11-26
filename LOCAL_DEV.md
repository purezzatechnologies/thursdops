# ThursdOps — Local Development

Runs the full app **offline** against a local Supabase stack (Postgres + Auth +
Storage + API) in Docker. No cloud account or secrets required.

## One-time setup (already done on this machine)

Installed via Homebrew: `colima`, `docker`, `supabase`.

```bash
brew install colima docker supabase/tap/supabase
npm install
```

## Start everything

```bash
# 1. Docker runtime
colima start --cpu 2 --memory 6 --disk 30

# 2. Local Supabase (applies all migrations + seeds demo users)
export DOCKER_HOST="unix://$HOME/.colima/docker.sock"
supabase start

# 3. App dev server
npm run dev            # http://localhost:8080
```

Open http://localhost:8080 → **Demo login** page. One click signs you into any
role (password for all seeded accounts: `Demo2026!`).

Useful local URLs:
- App: http://localhost:8080
- Supabase Studio (DB UI): http://localhost:54323
- Mailpit (captured auth emails): http://localhost:54324

## Stop everything

```bash
supabase stop         # stops the DB/API containers (data persists)
colima stop           # stops the Docker VM
```

## Environment variables

The app is fully env-driven, so the **same code** runs locally and deployed —
only these values change.

| Variable | Used by | Local value |
|---|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | server + browser | `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | server + browser (anon) | local demo anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (bypasses RLS) | local demo service_role key |

- `.env` — Vite reads `VITE_*` for the browser.
- `.dev.vars` — the Cloudflare Vite plugin reads the plain `SUPABASE_*` for the
  server/worker side. Keep both in sync.
- `.env.example` — template.

The local keys are the well-known Supabase demo keys (not secrets). All three
files are git-ignored.

## Deploying later

Architecture: TanStack Start (SSR) → **Cloudflare Workers** (`wrangler.jsonc`,
`src/server.ts`), backend on Supabase.

1. Provision a Supabase project (cloud or self-hosted) and push the schema:
   `supabase link` + `supabase db push` (applies everything in
   `supabase/migrations/`, including the base-grants migration).
2. Set the same variable names as **Worker secrets**:
   `wrangler secret put SUPABASE_URL` (and the two keys, plus the `VITE_*` ones
   as build-time vars).
3. Build + deploy: `npm run build` then `wrangler deploy`.
4. **Before production**: rotate demo passwords and disable/remove the
   `/demo-login` route (see the note at the top of `src/routes/demo-login.tsx`).

## Notes on changes made to get this running

- `supabase/migrations/20260807000000_grant_base_table_privileges.sql` — grants
  base `SELECT/INSERT/UPDATE/DELETE` on public tables to `anon`/`authenticated`.
  RLS + policies were present but the base table grants (supplied implicitly by
  Supabase Cloud) were missing, so every read failed locally with 42501. RLS
  still governs all row access; this only makes tables reachable.
- `supabase/config.toml` — disabled the local `analytics` (Logflare) stack; it's
  optional and its health checks were failing on Colima. No effect on deploys.
- `src/routes/admin.index.tsx` — the "Tasks in flight" count filtered on an
  invalid `task_status` value (`expired`, which only exists on `contract_status`),
  causing a 400. Removed it.
