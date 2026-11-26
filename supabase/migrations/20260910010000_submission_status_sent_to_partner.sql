-- New submission status for the manager → partner hand-off stage. A manager
-- "Send to Partner" moves the submission here; the partner then gives final
-- approval. Kept in its own migration because a freshly-added enum value cannot
-- be referenced in the same transaction that adds it.
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'sent_to_partner';
