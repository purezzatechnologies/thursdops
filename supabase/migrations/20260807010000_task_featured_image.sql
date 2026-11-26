-- Featured image for tasks: an explicitly uploaded image shown on kanban cards,
-- the quick-view popup, and the task detail page. Distinct from submission
-- screenshots (which are work deliverables); this is a manually chosen cover.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS featured_image_url text;

-- Public bucket so the cover image can be shown via a stable public URL
-- (no signed URLs needed on the board).
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read (bucket is public anyway; this covers API listing too).
CREATE POLICY "task_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-images');

-- Any authenticated user may upload/replace/remove task cover images.
-- (Whether they can attach it to a task is still governed by tasks RLS.)
CREATE POLICY "task_images_auth_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-images');

CREATE POLICY "task_images_auth_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'task-images');

CREATE POLICY "task_images_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-images');
