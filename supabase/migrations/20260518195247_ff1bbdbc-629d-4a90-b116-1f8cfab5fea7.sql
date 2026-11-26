
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
