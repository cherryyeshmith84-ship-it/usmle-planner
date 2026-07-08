-- USMLE Step 1 Planner - shared break-time pool for self assessments
-- (e.g. 300 min exam + 15 min break = 315 min total, like the real exam)
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

alter table public.assessments
  add column if not exists break_minutes int not null default 15;
