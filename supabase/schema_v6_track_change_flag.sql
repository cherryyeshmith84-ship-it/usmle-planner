-- USMLE Step 1 Planner - flag when a student switches Step 1 <-> Subject exams
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

alter table public.profiles
  add column if not exists track_changed_pending boolean not null default false;
