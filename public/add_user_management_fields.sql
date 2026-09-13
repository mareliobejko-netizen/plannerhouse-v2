-- PlannerHouse V2 / La Dogana Guest Portal
-- Run once on Neon before deploying this version.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_prompt_pending boolean NOT NULL DEFAULT false;

-- Existing users are left unchanged (false). New users created by the admin
-- will be set to true so they see the first-login password choice.
