-- Extend the deliverable_type vocabulary to Marcel's reporting sheet (locked
-- list), grouped Website / Newsletter / Social. The original 5 values stay for
-- backward compatibility (they back the contract planner's promised counts and
-- existing data); these are additive. Nomenclature only — no feature changes.
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'extra_article';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'banner_homepage';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'banner_newsletter';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'newsletter_mention';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'top_reads';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'most_read';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'editorial_feature';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'campaign_presence';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'case_study';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'intelligence_report';
ALTER TYPE public.deliverable_type ADD VALUE IF NOT EXISTS 'event_coverage';
