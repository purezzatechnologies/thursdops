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
