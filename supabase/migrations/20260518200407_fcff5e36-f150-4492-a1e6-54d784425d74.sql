
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Editors: read own files
CREATE POLICY "submissions_owner_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Editors: upload own files
CREATE POLICY "submissions_owner_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Editors: update/delete own files
CREATE POLICY "submissions_owner_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "submissions_owner_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Managers / super admins: read all
CREATE POLICY "submissions_admin_mgr_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'submissions'
  AND public.is_admin_or_manager(auth.uid())
);
