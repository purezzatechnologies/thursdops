-- ThursdOps — consolidated Postgres schema (public), built by concatenating
-- the Supabase migrations in order. This is the exact DDL (+ seed data) that
-- created the production database. Source of truth: supabase/migrations/.
-- Generated: 2026-11-26T13:10:48Z

-- ============================================================
-- 20260518192053_dc1713bc-3550-48d6-adcf-bab64cd89222.sql
-- ============================================================

-- ENUMS
CREATE TYPE public.user_role AS ENUM ('super_admin','manager','editor','ops_support','content_partner');
CREATE TYPE public.contract_plan_type AS ENUM ('monthly','quarterly','six_month','annual','custom');
CREATE TYPE public.contract_status AS ENUM ('draft','active','completed','expired','cancelled');
CREATE TYPE public.deliverable_type AS ENUM ('article','newsletter','homepage_banner','article_banner','social_post');
CREATE TYPE public.task_status AS ENUM ('not_started','in_progress','submitted','under_review','rework_requested','approved','completed','cancelled');
CREATE TYPE public.task_priority AS ENUM ('low','normal','high');
CREATE TYPE public.submission_type AS ENUM ('url','file','screenshot','social_link');
CREATE TYPE public.submission_status AS ENUM ('draft','submitted','under_review','approved','rejected','rework_requested');
CREATE TYPE public.kpi_status AS ENUM ('pending_qc','qc_approved','qc_rejected');

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role public.user_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = _user_id $$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role IN ('super_admin','manager')) $$;

-- CONTENT PARTNERS
CREATE TABLE public.content_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_details text,
  contact_email text,
  contact_phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER content_partners_updated_at BEFORE UPDATE ON public.content_partners
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PARTNER USERS
CREATE TABLE public.partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_partner_id uuid NOT NULL REFERENCES public.content_partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (profile_id, content_partner_id),
  UNIQUE (profile_id)
);
CREATE TRIGGER partner_users_updated_at BEFORE UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.current_partner_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT content_partner_id FROM public.partner_users WHERE profile_id = _user_id LIMIT 1 $$;

-- CONTRACTS
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_partner_id uuid NOT NULL REFERENCES public.content_partners(id) ON DELETE RESTRICT,
  plan_type public.contract_plan_type NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.contract_status NOT NULL DEFAULT 'draft',
  total_articles integer NOT NULL DEFAULT 0,
  total_newsletters integer NOT NULL DEFAULT 0,
  total_homepage_banners integer NOT NULL DEFAULT 0,
  total_article_banners integer NOT NULL DEFAULT 0,
  total_social_posts integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- CONTRACT OWNERS
CREATE TABLE public.contract_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (contract_id, profile_id)
);
CREATE TRIGGER contract_owners_updated_at BEFORE UPDATE ON public.contract_owners
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TASKS
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  deliverable_type public.deliverable_type NOT NULL,
  title text NOT NULL,
  brief text,
  assigned_to uuid REFERENCES public.profiles(id),
  due_date date NOT NULL,
  status public.task_status NOT NULL DEFAULT 'not_started',
  priority public.task_priority NOT NULL DEFAULT 'normal',
  is_extra boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.editor_can_see_contract(_user_id uuid, _contract_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tasks WHERE contract_id = _contract_id AND assigned_to = _user_id) $$;

-- SUBMISSIONS
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  submission_type public.submission_type NOT NULL,
  url text,
  file_url text,
  screenshot_url text,
  notes text,
  status public.submission_status NOT NULL DEFAULT 'draft',
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_comments text,
  reviewing_by uuid REFERENCES public.profiles(id),
  reviewing_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER submissions_updated_at BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- KPI SNAPSHOTS
CREATE TABLE public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  recorded_date date NOT NULL,
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  engagement_rate numeric(5,2),
  notes text,
  status public.kpi_status NOT NULL DEFAULT 'pending_qc',
  qc_approved_by uuid REFERENCES public.profiles(id),
  qc_approved_at timestamptz,
  qc_comments text,
  entered_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE TRIGGER kpi_snapshots_updated_at BEFORE UPDATE ON public.kpi_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- KPI SNAPSHOT EDITS (audit log)
CREATE TABLE public.kpi_snapshot_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.kpi_snapshots(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  edited_by uuid NOT NULL REFERENCES public.profiles(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tg_kpi_snapshot_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_editor uuid := COALESCE(NEW.updated_by, auth.uid());
  v_changed boolean := false;
BEGIN
  IF NEW.clicks IS DISTINCT FROM OLD.clicks THEN
    INSERT INTO public.kpi_snapshot_edits(snapshot_id, field_name, old_value, new_value, edited_by)
    VALUES (NEW.id, 'clicks', OLD.clicks::text, NEW.clicks::text, v_editor);
    v_changed := true;
  END IF;
  IF NEW.impressions IS DISTINCT FROM OLD.impressions THEN
    INSERT INTO public.kpi_snapshot_edits(snapshot_id, field_name, old_value, new_value, edited_by)
    VALUES (NEW.id, 'impressions', OLD.impressions::text, NEW.impressions::text, v_editor);
    v_changed := true;
  END IF;
  IF NEW.engagement_rate IS DISTINCT FROM OLD.engagement_rate THEN
    INSERT INTO public.kpi_snapshot_edits(snapshot_id, field_name, old_value, new_value, edited_by)
    VALUES (NEW.id, 'engagement_rate', OLD.engagement_rate::text, NEW.engagement_rate::text, v_editor);
    v_changed := true;
  END IF;
  IF v_changed AND OLD.status = 'qc_approved' THEN
    NEW.status := 'pending_qc';
    NEW.qc_approved_by := NULL;
    NEW.qc_approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER kpi_snapshots_audit BEFORE UPDATE ON public.kpi_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_kpi_snapshot_audit();

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- USER PREFERENCES
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, key)
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_snapshot_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_admin_mgr_read" ON public.profiles FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- CONTENT PARTNERS
CREATE POLICY "cp_admin_mgr_all" ON public.content_partners FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "cp_internal_read" ON public.content_partners FOR SELECT USING (public.get_user_role(auth.uid()) IN ('editor','ops_support'));
CREATE POLICY "cp_partner_read_own" ON public.content_partners FOR SELECT USING (public.has_role(auth.uid(), 'content_partner') AND id = public.current_partner_id(auth.uid()));

-- PARTNER USERS
CREATE POLICY "pu_admin_mgr_all" ON public.partner_users FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "pu_partner_read_self" ON public.partner_users FOR SELECT USING (profile_id = auth.uid());

-- CONTRACTS
CREATE POLICY "contracts_admin_mgr_all" ON public.contracts FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contracts_internal_read" ON public.contracts FOR SELECT USING (public.get_user_role(auth.uid()) IN ('editor','ops_support'));
CREATE POLICY "contracts_partner_read" ON public.contracts FOR SELECT USING (public.has_role(auth.uid(), 'content_partner') AND content_partner_id = public.current_partner_id(auth.uid()));

-- CONTRACT OWNERS
CREATE POLICY "co_admin_mgr_all" ON public.contract_owners FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- TASKS
CREATE POLICY "tasks_admin_mgr_all" ON public.tasks FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "tasks_editor_read_assigned" ON public.tasks FOR SELECT USING (public.has_role(auth.uid(), 'editor') AND (assigned_to = auth.uid() OR public.editor_can_see_contract(auth.uid(), contract_id)));
CREATE POLICY "tasks_editor_update_own" ON public.tasks FOR UPDATE USING (public.has_role(auth.uid(), 'editor') AND assigned_to = auth.uid()) WITH CHECK (public.has_role(auth.uid(), 'editor') AND assigned_to = auth.uid());
CREATE POLICY "tasks_ops_read_ns" ON public.tasks FOR SELECT USING (public.has_role(auth.uid(), 'ops_support') AND deliverable_type IN ('newsletter','social_post'));
CREATE POLICY "tasks_ops_update_ns" ON public.tasks FOR UPDATE USING (public.has_role(auth.uid(), 'ops_support') AND deliverable_type IN ('newsletter','social_post')) WITH CHECK (public.has_role(auth.uid(), 'ops_support') AND deliverable_type IN ('newsletter','social_post') AND (assigned_to IS NULL OR assigned_to = auth.uid()));

-- SUBMISSIONS
CREATE POLICY "subs_admin_mgr_all" ON public.submissions FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "subs_editor_rw_own" ON public.submissions FOR ALL USING (public.has_role(auth.uid(), 'editor') AND submitted_by = auth.uid()) WITH CHECK (public.has_role(auth.uid(), 'editor') AND submitted_by = auth.uid());
CREATE POLICY "subs_editor_read_visible" ON public.submissions FOR SELECT USING (public.has_role(auth.uid(), 'editor') AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = submissions.task_id AND (t.assigned_to = auth.uid() OR public.editor_can_see_contract(auth.uid(), t.contract_id))));
CREATE POLICY "subs_ops_rw_ns" ON public.submissions FOR ALL USING (public.has_role(auth.uid(), 'ops_support') AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = submissions.task_id AND t.deliverable_type IN ('newsletter','social_post'))) WITH CHECK (public.has_role(auth.uid(), 'ops_support') AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = submissions.task_id AND t.deliverable_type IN ('newsletter','social_post')));
CREATE POLICY "subs_partner_read_approved" ON public.submissions FOR SELECT USING (public.has_role(auth.uid(), 'content_partner') AND status = 'approved' AND EXISTS (SELECT 1 FROM public.tasks t JOIN public.contracts c ON c.id = t.contract_id WHERE t.id = submissions.task_id AND c.content_partner_id = public.current_partner_id(auth.uid())));

-- KPI SNAPSHOTS
CREATE POLICY "kpi_admin_mgr_all" ON public.kpi_snapshots FOR ALL USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "kpi_ops_all" ON public.kpi_snapshots FOR ALL USING (public.has_role(auth.uid(), 'ops_support')) WITH CHECK (public.has_role(auth.uid(), 'ops_support'));
CREATE POLICY "kpi_editor_read_own" ON public.kpi_snapshots FOR SELECT USING (public.has_role(auth.uid(), 'editor') AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = kpi_snapshots.submission_id AND s.submitted_by = auth.uid()));
CREATE POLICY "kpi_partner_read_qc" ON public.kpi_snapshots FOR SELECT USING (public.has_role(auth.uid(), 'content_partner') AND status = 'qc_approved' AND EXISTS (SELECT 1 FROM public.submissions s JOIN public.tasks t ON t.id = s.task_id JOIN public.contracts c ON c.id = t.contract_id WHERE s.id = kpi_snapshots.submission_id AND c.content_partner_id = public.current_partner_id(auth.uid())));

-- KPI SNAPSHOT EDITS
CREATE POLICY "kpiedits_admin_mgr_read" ON public.kpi_snapshot_edits FOR SELECT USING (public.is_admin_or_manager(auth.uid()));

-- NOTIFICATIONS
CREATE POLICY "notif_self_read" ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notif_self_update" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- USER PREFERENCES
CREATE POLICY "pref_self_all" ON public.user_preferences FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());


-- ============================================================
-- 20260518192131_e1bae4f4-f105-46ef-8661-52866bf42ec6.sql
-- ============================================================

-- Fix search_path on plain helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Revoke broad EXECUTE on security-definer helpers; only allow authenticated users
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_partner_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.editor_can_see_contract(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_kpi_snapshot_audit() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_partner_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editor_can_see_contract(uuid, uuid) TO authenticated;

-- Seed demo auth users + profiles. Password for all: Demo2026!
DO $seed$
DECLARE
  v_pw text := extensions.crypt('Demo2026!', extensions.gen_salt('bf'));
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('arnold@thursd.com','Arnold Wittkamp','super_admin'),
      ('marcel@thursd.com','Marcel de Romph','manager'),
      ('edwin@thursd.com','Edwin Kirwa','manager'),
      ('regine@thursd.com','Regine Motmans','manager'),
      ('vaibhav@thursd.com','Vaibhav Sharma','manager'),
      ('nishant@thursd.com','Nishant Mehta','manager'),
      ('melissa@thursd.com','Melissa Maingot Gerstein','editor'),
      ('brian@thursd.com','Brian Okinda','editor'),
      ('elize@thursd.com','Elize Rassland','editor'),
      ('saral@thursd.com','Saral Sharma','ops_support')
    ) AS t(email, full_name, role)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = rec.email) THEN
      WITH new_user AS (
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at,
          raw_app_meta_data, raw_user_meta_data,
          confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          gen_random_uuid(), 'authenticated', 'authenticated',
          rec.email, v_pw,
          now(), now(), now(),
          jsonb_build_object('provider','email','providers',ARRAY['email']),
          jsonb_build_object('full_name', rec.full_name),
          '', '', '', ''
        )
        RETURNING id
      )
      INSERT INTO public.profiles (id, email, full_name, role)
      SELECT id, rec.email, rec.full_name, rec.role::public.user_role FROM new_user;
    END IF;
  END LOOP;
END $seed$;


-- ============================================================
-- 20260518195247_ff1bbdbc-629d-4a90-b116-1f8cfab5fea7.sql
-- ============================================================

-- Schedule summary function: returns one row per deliverable type for a contract,
-- with promised/delivered/scheduled/unscheduled + extras counts.
CREATE OR REPLACE FUNCTION public.contract_deliverable_summary(_contract_id uuid)
RETURNS TABLE (
  deliverable_type text,
  total_promised integer,
  delivered_count integer,
  scheduled_count integer,
  unscheduled_count integer,
  extras_delivered_count integer,
  extras_scheduled_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH types(t, promised) AS (
    VALUES
      ('article'::text, v_contract.total_articles),
      ('newsletter', v_contract.total_newsletters),
      ('homepage_banner', v_contract.total_homepage_banners),
      ('article_banner', v_contract.total_article_banners),
      ('social_post', v_contract.total_social_posts)
  ),
  task_counts AS (
    SELECT
      t.deliverable_type::text AS t,
      t.is_extra,
      COUNT(*) FILTER (WHERE t.status = 'completed') AS delivered,
      COUNT(*) FILTER (WHERE t.status IN ('not_started','in_progress','submitted','under_review','rework_requested','approved')) AS scheduled
    FROM public.tasks t
    WHERE t.contract_id = _contract_id
    GROUP BY t.deliverable_type, t.is_extra
  )
  SELECT
    types.t,
    types.promised,
    COALESCE(SUM(tc.delivered) FILTER (WHERE tc.is_extra = false), 0)::int AS delivered_count,
    COALESCE(SUM(tc.scheduled) FILTER (WHERE tc.is_extra = false), 0)::int AS scheduled_count,
    GREATEST(
      types.promised
        - COALESCE(SUM(tc.delivered) FILTER (WHERE tc.is_extra = false), 0)::int
        - COALESCE(SUM(tc.scheduled) FILTER (WHERE tc.is_extra = false), 0)::int,
      0
    ) AS unscheduled_count,
    COALESCE(SUM(tc.delivered) FILTER (WHERE tc.is_extra = true), 0)::int AS extras_delivered_count,
    COALESCE(SUM(tc.scheduled) FILTER (WHERE tc.is_extra = true), 0)::int AS extras_scheduled_count
  FROM types
  LEFT JOIN task_counts tc ON tc.t = types.t
  GROUP BY types.t, types.promised
  ORDER BY CASE types.t
    WHEN 'article' THEN 1
    WHEN 'newsletter' THEN 2
    WHEN 'homepage_banner' THEN 3
    WHEN 'article_banner' THEN 4
    WHEN 'social_post' THEN 5
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.contract_deliverable_summary(uuid) TO authenticated;

-- Allow service role to write notifications (no policy change needed; SR bypasses RLS).
-- But also allow admins/managers to insert notifications they own (defensive).
CREATE POLICY "notif_admin_mgr_insert"
  ON public.notifications
  FOR INSERT
  WITH CHECK (public.is_admin_or_manager(auth.uid()));


-- ============================================================
-- 20260518200407_fcff5e36-f150-4492-a1e6-54d784425d74.sql
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Editors: read own files
CREATE POLICY "submissions_owner_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Editors: upload own files
CREATE POLICY "submissions_owner_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Editors: update/delete own files
CREATE POLICY "submissions_owner_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "submissions_owner_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Managers / super admins: read all
CREATE POLICY "submissions_admin_mgr_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'submissions'
  AND public.is_admin_or_manager(auth.uid())
);


-- ============================================================
-- 20260518201411_1b46f2c0-17ab-49b5-a067-4d17d75bc233.sql
-- ============================================================
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ============================================================
-- 20260519174216_564acf3a-7265-40ac-92c8-5076f519f2b0.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.universal_search(_q text, _limit integer DEFAULT 5)
RETURNS TABLE(
  kind text,
  id uuid,
  title text,
  subtitle text,
  status text,
  link_id uuid,
  extra jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  (SELECT
    'task'::text AS kind,
    t.id,
    t.title,
    cp.name AS subtitle,
    t.status::text AS status,
    t.id AS link_id,
    jsonb_build_object('deliverable_type', t.deliverable_type, 'contract_id', t.contract_id) AS extra
  FROM tasks t
  LEFT JOIN contracts c ON c.id = t.contract_id
  LEFT JOIN content_partners cp ON cp.id = c.content_partner_id
  WHERE t.title ILIKE '%' || trim(_q) || '%'
  ORDER BY t.updated_at DESC
  LIMIT _limit)
  UNION ALL
  (SELECT
    'contract'::text,
    c.id,
    cp.name,
    c.plan_type::text || ' · ' || to_char(c.start_date, 'DD Mon YYYY'),
    c.status::text,
    c.id,
    jsonb_build_object('partner_id', c.content_partner_id)
  FROM contracts c
  JOIN content_partners cp ON cp.id = c.content_partner_id
  WHERE cp.name ILIKE '%' || trim(_q) || '%'
     OR c.id::text ILIKE '%' || trim(_q) || '%'
  ORDER BY c.updated_at DESC
  LIMIT _limit)
  UNION ALL
  (SELECT
    'partner'::text,
    cp.id,
    cp.name,
    cp.contact_email,
    CASE WHEN cp.is_active THEN 'active' ELSE 'inactive' END,
    cp.id,
    '{}'::jsonb
  FROM content_partners cp
  WHERE cp.name ILIKE '%' || trim(_q) || '%'
  ORDER BY cp.updated_at DESC
  LIMIT _limit)
  UNION ALL
  (SELECT
    'submission'::text,
    s.id,
    t.title,
    cp.name,
    s.status::text,
    s.id,
    jsonb_build_object('task_id', s.task_id)
  FROM submissions s
  JOIN tasks t ON t.id = s.task_id
  LEFT JOIN contracts c ON c.id = t.contract_id
  LEFT JOIN content_partners cp ON cp.id = c.content_partner_id
  WHERE t.title ILIKE '%' || trim(_q) || '%'
  ORDER BY s.updated_at DESC
  LIMIT _limit);
$$;

GRANT EXECUTE ON FUNCTION public.universal_search(text, integer) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ============================================================
-- 20260617202536_13a46230-059a-446b-bdae-999e93bd8d59.sql
-- ============================================================

-- 1) Allow editorial tasks (no contract)
ALTER TABLE public.tasks ALTER COLUMN contract_id DROP NOT NULL;

-- 2) Task origin enum
DO $$ BEGIN
  CREATE TYPE public.task_origin AS ENUM ('contract','editorial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_origin public.task_origin NOT NULL DEFAULT 'contract',
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS week_label text,
  ADD COLUMN IF NOT EXISTS priority_bucket text;

-- 3) Helpers
CREATE OR REPLACE FUNCTION public.task_week_start(_d date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  -- Thursday-anchored week: shift back to most recent Thursday (dow 4)
  SELECT _d - ((EXTRACT(DOW FROM _d)::int - 4 + 7) % 7)
$$;

CREATE OR REPLACE FUNCTION public.task_week_label(_d date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT to_char(public.task_week_start(_d), 'IYYY"-W"IW')
$$;

-- Bucket: based on days remaining from today to due date.
-- closed/cancelled/approved/completed -> NULL (no urgency)
-- overdue (and still open) -> critical
-- <=2 days -> critical, 3-4 -> yellow, >=5 -> green
CREATE OR REPLACE FUNCTION public.task_priority_bucket(_due date, _status public.task_status)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _status IN ('approved','completed','cancelled') THEN NULL
    WHEN _due < CURRENT_DATE THEN 'critical'
    WHEN (_due - CURRENT_DATE) <= 2 THEN 'critical'
    WHEN (_due - CURRENT_DATE) <= 4 THEN 'yellow'
    ELSE 'green'
  END
$$;

-- 4) Trigger keeps week_start / week_label / priority_bucket in sync
CREATE OR REPLACE FUNCTION public.tg_tasks_week_priority()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.week_start := public.task_week_start(NEW.due_date);
  NEW.week_label := public.task_week_label(NEW.due_date);
  NEW.priority_bucket := public.task_priority_bucket(NEW.due_date, NEW.status);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_week_priority ON public.tasks;
CREATE TRIGGER tasks_week_priority
  BEFORE INSERT OR UPDATE OF due_date, status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_week_priority();

-- 5) Backfill
UPDATE public.tasks SET
  week_start = public.task_week_start(due_date),
  week_label = public.task_week_label(due_date),
  priority_bucket = public.task_priority_bucket(due_date, status),
  task_origin = CASE WHEN contract_id IS NULL THEN 'editorial'::public.task_origin ELSE 'contract'::public.task_origin END
WHERE week_start IS NULL OR week_label IS NULL;

-- 6) Index for board queries
CREATE INDEX IF NOT EXISTS tasks_week_priority_status_idx
  ON public.tasks (week_start, priority_bucket, status);
CREATE INDEX IF NOT EXISTS tasks_origin_idx ON public.tasks (task_origin);

-- 7) Bulk recompute function for the nightly cron (added later via insert tool)
CREATE OR REPLACE FUNCTION public.recompute_task_priority_buckets()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.tasks
     SET priority_bucket = public.task_priority_bucket(due_date, status)
   WHERE status NOT IN ('approved','completed','cancelled');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;


-- ============================================================
-- 20260626190944_5964429b-1f3d-4941-b32f-e28778c5e6b1.sql
-- ============================================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS copied_from_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_copied_from_idx ON public.tasks (copied_from_task_id);

-- ============================================================
-- 20260728145522_f7d3729a-904d-44a1-a4b5-6c7b976950e7.sql
-- ============================================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS tasks_sort_order_idx ON public.tasks (due_date, sort_order);

-- Backfill: give existing rows an ordering based on created_at within each due_date
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY due_date ORDER BY created_at) * 10 AS rn
  FROM public.tasks
)
UPDATE public.tasks t SET sort_order = ordered.rn
FROM ordered WHERE ordered.id = t.id;

-- ============================================================
-- 20260807000000_grant_base_table_privileges.sql
-- ============================================================
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


-- ============================================================
-- 20260807010000_task_featured_image.sql
-- ============================================================
-- Featured image for tasks: an explicitly uploaded image shown on kanban cards,
-- the quick-view popup, and the task detail page. Distinct from submission
-- screenshots (which are work deliverables); this is a manually chosen cover.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS featured_image_url text;

-- Public bucket so the cover image can be shown via a stable public URL
-- (no signed URLs needed on the board).
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read (bucket is public anyway; this covers API listing too).
CREATE POLICY "task_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-images');

-- Any authenticated user may upload/replace/remove task cover images.
-- (Whether they can attach it to a task is still governed by tasks RLS.)
CREATE POLICY "task_images_auth_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-images');

CREATE POLICY "task_images_auth_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'task-images');

CREATE POLICY "task_images_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-images');


-- ============================================================
-- 20260808000000_submission_text_update.sql
-- ============================================================
-- Add a "text" submission type: a written update the assignee can submit
-- instead of (or alongside) a URL/file/screenshot. The text lives in its own
-- column so it stays distinct from `notes` (reviewer-facing notes).

ALTER TYPE public.submission_type ADD VALUE IF NOT EXISTS 'text';

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS text_content text;


-- ============================================================
-- 20260809000000_profile_avatar.sql
-- ============================================================
-- Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Public avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated user can upload/update their own avatar
CREATE POLICY "avatars_self_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "avatars_self_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "avatars_self_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Anyone (even anon) can read avatars since bucket is public
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to update their own avatar_url
CREATE POLICY "profiles_self_update_avatar"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());


-- ============================================================
-- 20260811120000_partner_portal.sql
-- ============================================================
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


-- ============================================================
-- 20260819160000_data_backups.sql
-- ============================================================
-- Automatic data backups (super admin).
--
-- Stores point-in-time JSONB snapshots of all business tables in `data_backups`.
-- A pg_cron job runs every 6 hours creating an 'auto' backup and pruning old
-- ones. Super admins can also back up on demand and restore any snapshot.
-- Login accounts (profiles/auth) and preferences are NOT part of the snapshot,
-- so a restore never locks anyone out.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_backups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto', 'manual')),
  label        text,
  record_count integer NOT NULL DEFAULT 0,
  payload      jsonb NOT NULL,
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS data_backups_created_idx ON public.data_backups (created_at DESC);

ALTER TABLE public.data_backups ENABLE ROW LEVEL SECURITY;

-- Super admins may read backup metadata + payloads. Writes go through the
-- SECURITY DEFINER function / service role only (no client insert policy).
DROP POLICY IF EXISTS "backups_admin_read" ON public.data_backups;
CREATE POLICY "backups_admin_read" ON public.data_backups
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "backups_admin_delete" ON public.data_backups;
CREATE POLICY "backups_admin_delete" ON public.data_backups
  FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_backups
  TO anon, authenticated, service_role;

-- ── Snapshot function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_data_backup(
  _kind text DEFAULT 'auto',
  _label text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payload jsonb;
  _cnt integer;
  _id uuid;
BEGIN
  _payload := jsonb_build_object(
    'content_partners',   COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.content_partners t), '[]'::jsonb),
    'contracts',          COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.contracts t), '[]'::jsonb),
    'tasks',              COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.tasks t), '[]'::jsonb),
    'contract_owners',    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.contract_owners t), '[]'::jsonb),
    'partner_users',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.partner_users t), '[]'::jsonb),
    'submissions',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.submissions t), '[]'::jsonb),
    'partner_requests',   COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.partner_requests t), '[]'::jsonb),
    'kpi_snapshots',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.kpi_snapshots t), '[]'::jsonb),
    'kpi_snapshot_edits', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.kpi_snapshot_edits t), '[]'::jsonb),
    'notifications',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notifications t), '[]'::jsonb)
  );

  _cnt :=
    jsonb_array_length(_payload->'content_partners') + jsonb_array_length(_payload->'contracts') +
    jsonb_array_length(_payload->'tasks') + jsonb_array_length(_payload->'contract_owners') +
    jsonb_array_length(_payload->'partner_users') + jsonb_array_length(_payload->'submissions') +
    jsonb_array_length(_payload->'partner_requests') + jsonb_array_length(_payload->'kpi_snapshots') +
    jsonb_array_length(_payload->'kpi_snapshot_edits') + jsonb_array_length(_payload->'notifications');

  INSERT INTO public.data_backups (kind, label, record_count, payload, created_by)
    VALUES (_kind, _label, _cnt, _payload, _created_by)
    RETURNING id INTO _id;

  -- Keep the newest 16 auto backups (~4 days at 6h cadence).
  DELETE FROM public.data_backups
   WHERE kind = 'auto'
     AND id NOT IN (
       SELECT id FROM public.data_backups WHERE kind = 'auto' ORDER BY created_at DESC LIMIT 16
     );

  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_data_backup(text, text, uuid) TO authenticated, service_role;

-- ── Schedule: every 6 hours ─────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('thursdops-auto-backup');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule('thursdops-auto-backup', '0 */6 * * *', $$ SELECT public.create_data_backup('auto', NULL) $$);

-- Seed one backup immediately so the section isn't empty.
SELECT public.create_data_backup('auto', 'Initial snapshot');


-- ============================================================
-- 20260819170000_backup_interval.sql
-- ============================================================
-- Configurable automatic-backup interval.
-- A single-row config table holds the chosen interval (hours); a SECURITY
-- DEFINER function persists it and reschedules the pg_cron job accordingly.

CREATE TABLE IF NOT EXISTS public.backup_config (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  interval_hours integer NOT NULL DEFAULT 6,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);
INSERT INTO public.backup_config (id, interval_hours) VALUES (1, 6)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.backup_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_config_admin_read" ON public.backup_config;
CREATE POLICY "backup_config_admin_read" ON public.backup_config
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT, INSERT, UPDATE ON public.backup_config TO anon, authenticated, service_role;

-- Persist the interval + reschedule the cron job.
CREATE OR REPLACE FUNCTION public.set_backup_interval(_hours integer, _user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE _expr text;
BEGIN
  IF _hours NOT IN (1, 2, 3, 4, 6, 8, 12, 24) THEN
    RAISE EXCEPTION 'Unsupported interval: % hours', _hours;
  END IF;

  -- Cron expression: every N hours (daily at 00:00 when N = 24).
  _expr := CASE WHEN _hours >= 24 THEN '0 0 * * *' ELSE '0 */' || _hours || ' * * *' END;

  BEGIN
    PERFORM cron.unschedule('thursdops-auto-backup');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('thursdops-auto-backup', _expr, $q$ SELECT public.create_data_backup('auto', NULL) $q$);

  UPDATE public.backup_config SET interval_hours = _hours, updated_at = now(), updated_by = _user WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.backup_config (id, interval_hours, updated_by) VALUES (1, _hours, _user);
  END IF;

  RETURN _hours;
END $$;

GRANT EXECUTE ON FUNCTION public.set_backup_interval(integer, uuid) TO authenticated, service_role;

-- Align the existing schedule with the stored default (idempotent).
SELECT public.set_backup_interval((SELECT interval_hours FROM public.backup_config WHERE id = 1), NULL);


-- ============================================================
-- 20260819180000_app_branding.sql
-- ============================================================
-- App-wide branding: a super admin can set a custom logo shown across the app.
-- Stored as a data URL (or storage URL) in a single-row table. Readable by
-- everyone (the logo appears on the login screen and for all roles); writable
-- only via the service-role server function.

CREATE TABLE IF NOT EXISTS public.app_branding (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_url   text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.app_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon on the login page) can read the current logo.
DROP POLICY IF EXISTS "branding_public_read" ON public.app_branding;
CREATE POLICY "branding_public_read" ON public.app_branding
  FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE ON public.app_branding TO anon, authenticated, service_role;


-- ============================================================
-- 20260905000000_seed_partner_logins.sql
-- ============================================================
-- Give every active content partner a login account (auth user + profile +
-- partner_users link) so partners can sign in and appear in the Content Partners
-- section of /demo-login. Idempotent: any partner that already has a linked user
-- is skipped, so re-running is safe.
--
-- SECURITY: password for all generated partner logins is the shared demo password
-- (Demo2026!). Rotate before real production use — see deployment checklist.
DO $seed$
DECLARE
  cp record;
  v_uid uuid;
  v_email text;
  v_pw text := extensions.crypt('Demo2026!', extensions.gen_salt('bf'));
BEGIN
  FOR cp IN
    SELECT c.id, c.name
    FROM public.content_partners c
    WHERE c.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.partner_users pu WHERE pu.content_partner_id = c.id
      )
  LOOP
    -- Deterministic, collision-free login email derived from the partner id.
    v_email := 'partner-' || left(replace(cp.id::text, '-', ''), 10) || '@thursd.com';
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      CONTINUE;
    END IF;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      v_email, v_pw,
      now(), now(), now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', cp.name),
      '', '', '', ''
    )
    RETURNING id INTO v_uid;

    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (v_uid, v_email, cp.name, 'content_partner', true);

    INSERT INTO public.partner_users (profile_id, content_partner_id)
    VALUES (v_uid, cp.id);
  END LOOP;
END $seed$;


-- ============================================================
-- 20260910000000_submission_attachments.sql
-- ============================================================
-- Allow a submission to carry MULTIPLE files / screenshots / links instead of a
-- single one. Stored as a JSON array of { kind, url, name }. The legacy single
-- columns (url / file_url / screenshot_url) are kept in sync with the first
-- matching attachment so existing readers keep working.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;


-- ============================================================
-- 20260910010000_submission_status_sent_to_partner.sql
-- ============================================================
-- New submission status for the manager → partner hand-off stage. A manager
-- "Send to Partner" moves the submission here; the partner then gives final
-- approval. Kept in its own migration because a freshly-added enum value cannot
-- be referenced in the same transaction that adds it.
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'sent_to_partner';


-- ============================================================
-- 20260910020000_partner_read_sent_to_partner.sql
-- ============================================================
-- Let content partners read submissions that have been sent to them for final
-- approval (previously they could only read already-approved ones).
DROP POLICY IF EXISTS "subs_partner_read_sent" ON public.submissions;
CREATE POLICY "subs_partner_read_sent" ON public.submissions FOR SELECT USING (
  public.has_role(auth.uid(), 'content_partner')
  AND status = 'sent_to_partner'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.contracts c ON c.id = t.contract_id
    WHERE t.id = submissions.task_id
      AND c.content_partner_id = public.current_partner_id(auth.uid())
  )
);


-- ============================================================
-- 20260910030000_submission_status_manager_approved.sql
-- ============================================================
-- Intermediate status: a manager has approved the work, and it's now ready to
-- be sent to the partner for final approval. Own migration because a new enum
-- value can't be used in the same transaction that adds it.
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'manager_approved';


-- ============================================================
-- 20260912000000_deliverable_vocabulary.sql
-- ============================================================
-- Extend the deliverable_type vocabulary to Marcel's reporting sheet (locked
-- list), grouped Website / Newsletter / Social. The original 5 values stay for
-- backward compatibility (they back the contract planner's promised counts and
-- existing data); these are additive. Nomenclature only — no feature changes.
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'extra_article';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'banner_homepage';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'banner_newsletter';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'newsletter_mention';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'top_reads';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'most_read';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'editorial_feature';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'campaign_presence';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'case_study';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'intelligence_report';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'event_coverage';


-- ============================================================
-- 20260912100000_partner_show_kpi.sql
-- ============================================================
-- KPI metrics are hidden from partners by DEFAULT. A super-admin / manager can
-- toggle visibility per partner (content_partners.show_kpi_data). Enforced in
-- RLS: with the flag off, a partner simply gets no KPI rows back.
ALTER TABLE public.content_partners
  ADD COLUMN IF NOT EXISTS show_kpi_data boolean NOT NULL DEFAULT false;

-- Partners can read qc-approved KPI snapshots for their own contracts ONLY when
-- their partner record has show_kpi_data = true.
DROP POLICY IF EXISTS "kpi_partner_read_qc" ON public.kpi_snapshots;
CREATE POLICY "kpi_partner_read_qc" ON public.kpi_snapshots FOR SELECT USING (
  public.has_role(auth.uid(), 'content_partner')
  AND status = 'qc_approved'
  AND EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.tasks t ON t.id = s.task_id
    JOIN public.contracts c ON c.id = t.contract_id
    JOIN public.content_partners cp ON cp.id = c.content_partner_id
    WHERE s.id = kpi_snapshots.submission_id
      AND c.content_partner_id = public.current_partner_id(auth.uid())
      AND cp.show_kpi_data = true
  )
);


-- ============================================================
-- 20261012120000_import_verification.sql
-- ============================================================
-- Bulk-import "incomplete" support.
-- Rows imported with missing/unresolved data are still written, but flagged
-- (needs_verification = true) with a note of what's missing, so an admin can
-- review and "promote" them (clear the flag) once completed.
alter table public.content_partners add column if not exists needs_verification boolean not null default false;
alter table public.content_partners add column if not exists verification_note text;

alter table public.contracts add column if not exists needs_verification boolean not null default false;
alter table public.contracts add column if not exists verification_note text;

alter table public.tasks add column if not exists needs_verification boolean not null default false;
alter table public.tasks add column if not exists verification_note text;

alter table public.partner_requests add column if not exists needs_verification boolean not null default false;
alter table public.partner_requests add column if not exists verification_note text;


