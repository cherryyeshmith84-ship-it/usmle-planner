-- USMLE Step 1 Planner - block-based exam format for self assessments
-- (e.g. NBME-style: 10 blocks x 20 questions x 30 min each)
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

alter table public.assessments
  add column if not exists questions_per_block int not null default 20;

alter table public.assessments
  add column if not exists block_time_minutes int not null default 30;
