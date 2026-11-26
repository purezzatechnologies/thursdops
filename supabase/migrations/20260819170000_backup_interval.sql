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
