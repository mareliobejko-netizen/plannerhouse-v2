-- Run this once in Supabase SQL Editor before deploying the updated project.
alter table public.events
  add column if not exists welcome_title text,
  add column if not exists welcome_message text,
  add column if not exists tip_message text,
  add column if not exists tutorial_video_url text;

comment on column public.events.welcome_title is 'Custom title shown on the couple private page';
comment on column public.events.welcome_message is 'Custom welcome text shown on the couple private page';
comment on column public.events.tip_message is 'Short tip shown below the welcome message';
comment on column public.events.tutorial_video_url is 'Optional tutorial video URL for the couple';
