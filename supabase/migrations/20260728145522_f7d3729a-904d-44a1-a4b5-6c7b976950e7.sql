ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS tasks_sort_order_idx ON public.tasks (due_date, sort_order);

-- Backfill: give existing rows an ordering based on created_at within each due_date
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY due_date ORDER BY created_at) * 10 AS rn
  FROM public.tasks
)
UPDATE public.tasks t SET sort_order = ordered.rn
FROM ordered WHERE ordered.id = t.id;