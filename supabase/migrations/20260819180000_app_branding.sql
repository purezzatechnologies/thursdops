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
