-- Partner portal: let content partners track progress + raise requests/queries.
--
-- 1. Partners can READ the tasks under their own contracts (progress tracking).
--    Previously only contracts / approved submissions / qc'd KPIs were readable,
--    so the partner dashboard's delivered/scheduled counts came back empty.
-- 2. New `partner_requests` table so partners can raise a query or request a
--    change/extra, and managers can respond + set status.

-- ── 1. Partner read on tasks ───────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_partner_read" ON public.tasks;
CREATE POLICY "tasks_partner_read" ON public.tasks
  FOR SELECT USING (
    public.has_role(auth.uid(), 'content_partner')
    AND contract_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = tasks.contract_id
        AND c.content_partner_id = public.current_partner_id(auth.uid())
    )
  );

-- ── 2. partner_requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_partner_id uuid NOT NULL REFERENCES public.content_partners(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'query'
    CHECK (kind IN ('query', 'change_request', 'new_deliverable', 'issue', 'other')),
  subject text NOT NULL,
  message text NOT NULL,
  related_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'declined')),
  response text,
  responded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS partner_requests_partner_idx ON public.partner_requests (content_partner_id);
CREATE INDEX IF NOT EXISTS partner_requests_status_idx  ON public.partner_requests (status);

DROP TRIGGER IF EXISTS partner_requests_updated_at ON public.partner_requests;
CREATE TRIGGER partner_requests_updated_at BEFORE UPDATE ON public.partner_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.partner_requests ENABLE ROW LEVEL SECURITY;

-- Managers / super admins: full access (view + respond + set status).
DROP POLICY IF EXISTS "pr_admin_mgr_all" ON public.partner_requests;
CREATE POLICY "pr_admin_mgr_all" ON public.partner_requests
  FOR ALL USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Partner: read own requests.
DROP POLICY IF EXISTS "pr_partner_read_own" ON public.partner_requests;
CREATE POLICY "pr_partner_read_own" ON public.partner_requests
  FOR SELECT USING (
    public.has_role(auth.uid(), 'content_partner')
    AND content_partner_id = public.current_partner_id(auth.uid())
  );

-- Partner: raise a request for their own partner, as themselves.
DROP POLICY IF EXISTS "pr_partner_insert_own" ON public.partner_requests;
CREATE POLICY "pr_partner_insert_own" ON public.partner_requests
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'content_partner')
    AND content_partner_id = public.current_partner_id(auth.uid())
    AND created_by = auth.uid()
  );

-- Base grants (mirrors the base-privileges migration; explicit for safety).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_requests
  TO anon, authenticated, service_role;

-- ── 3. Let the demo-login page list active content-partner accounts ─────
-- The /demo-login picker loads partner accounts from the DB (staff are hard
-- coded). Profiles RLS otherwise only allows self / admin-manager reads, so
-- the list was always empty. This narrow policy exposes ONLY active
-- content_partner rows (name + email) — same info the demo login already
-- shows for staff. The /demo-login route is removed before production.
DROP POLICY IF EXISTS "profiles_public_read_partners" ON public.profiles;
CREATE POLICY "profiles_public_read_partners" ON public.profiles
  FOR SELECT USING (role = 'content_partner' AND is_active = true);

-- The other profiles SELECT policy calls is_admin_or_manager(); anon must be
-- able to EXECUTE it (returns false for anon) or the whole query errors before
-- the policy above is reached.
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO anon;
