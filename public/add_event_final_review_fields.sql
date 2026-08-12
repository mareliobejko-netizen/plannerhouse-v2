-- PlannerHouse V2 — Step 3 final review fields
-- Run once on Neon before deploying the matching app version.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS couple_note text,
  ADD COLUMN IF NOT EXISTS portal_feedback_rating text,
  ADD COLUMN IF NOT EXISTS portal_feedback_comment text;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_portal_feedback_rating_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_portal_feedback_rating_check
  CHECK (
    portal_feedback_rating IS NULL
    OR portal_feedback_rating IN ('loved', 'good', 'could_be_better')
  );
