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
