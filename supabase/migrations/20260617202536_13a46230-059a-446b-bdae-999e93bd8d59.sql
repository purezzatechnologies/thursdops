
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
