-- Intermediate status: a manager has approved the work, and it's now ready to
-- be sent to the partner for final approval. Own migration because a new enum
-- value can't be used in the same transaction that adds it.
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'manager_approved';
