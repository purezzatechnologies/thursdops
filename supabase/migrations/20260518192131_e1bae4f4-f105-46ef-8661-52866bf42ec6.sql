
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
