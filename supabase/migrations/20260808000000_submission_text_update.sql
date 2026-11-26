-- Add a "text" submission type: a written update the assignee can submit
-- instead of (or alongside) a URL/file/screenshot. The text lives in its own
-- column so it stays distinct from `notes` (reviewer-facing notes).

ALTER TYPE public.submission_type ADD VALUE IF NOT EXISTS 'text';

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS text_content text;
