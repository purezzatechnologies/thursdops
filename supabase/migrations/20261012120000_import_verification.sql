-- Bulk-import "incomplete" support.
-- Rows imported with missing/unresolved data are still written, but flagged
-- (needs_verification = true) with a note of what's missing, so an admin can
-- review and "promote" them (clear the flag) once completed.
alter table public.content_partners add column if not exists needs_verification boolean not null default false;
alter table public.content_partners add column if not exists verification_note text;

alter table public.contracts add column if not exists needs_verification boolean not null default false;
alter table public.contracts add column if not exists verification_note text;

alter table public.tasks add column if not exists needs_verification boolean not null default false;
alter table public.tasks add column if not exists verification_note text;

alter table public.partner_requests add column if not exists needs_verification boolean not null default false;
alter table public.partner_requests add column if not exists verification_note text;
