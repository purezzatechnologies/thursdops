-- Allow a submission to carry MULTIPLE files / screenshots / links instead of a
-- single one. Stored as a JSON array of { kind, url, name }. The legacy single
-- columns (url / file_url / screenshot_url) are kept in sync with the first
-- matching attachment so existing readers keep working.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
