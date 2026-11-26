
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
