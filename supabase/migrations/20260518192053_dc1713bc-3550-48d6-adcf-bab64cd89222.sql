
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
