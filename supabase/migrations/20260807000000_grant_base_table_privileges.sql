-- Grant base table/sequence privileges to the anon & authenticated roles.
--
-- WHY: Every public table has RLS enabled with policies (row-level access is
-- fully governed by those policies). But Postgres requires BOTH a base table
-- privilege (SELECT/INSERT/UPDATE/DELETE) AND a passing RLS policy for access.
-- On Supabase Cloud the base grants are provided implicitly by the platform's
-- default privileges, so the app worked there. A fresh/self-hosted/local
-- Postgres has no such defaults, so reads failed with "permission denied for
-- table ..." (SQLSTATE 42501). This migration supplies those base grants
-- explicitly so local and deployed environments behave identically.
--
-- SECURITY: This does NOT loosen the model — RLS is still enabled on every
-- table and the 33 existing policies decide what each role can actually see or
-- change. These grants only make the tables reachable in the first place.

-- NOTE: service_role is included too. It bypasses RLS, but Postgres still
-- requires the base table privilege — server functions use the service_role
-- client (e.g. assertManager reading profiles.role), which failed with 42501
-- until this grant was added. Supabase Cloud grants these to service_role by
-- default; local/self-hosted Postgres does not.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Future tables/sequences created in this schema inherit the same base grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
