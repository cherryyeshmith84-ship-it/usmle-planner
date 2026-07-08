-- USMLE Step 1 Planner - Step 1 vs Subject exams onboarding tracks
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

-- 1. New profile fields for the richer onboarding flow.
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
  add column if not exists exam_track text check (exam_track in ('step1', 'subject'));

alter table public.profiles
  add column if not exists subject_name text;

alter table public.profiles
  add column if not exists completed_so_far text;

alter table public.profiles
  add column if not exists weak_areas text;

alter table public.profiles
  add column if not exists strong_areas text;

alter table public.profiles
  add column if not exists goals_notes text;

-- Backfill: anyone who already has a prep_stage set has already completed
-- (the old version of) onboarding, and was doing Step 1 prep by default.
update public.profiles
set onboarding_completed = true
where prep_stage is not null and onboarding_completed = false;

update public.profiles
set exam_track = 'step1'
where exam_track is null and prep_stage is not null;

-- 2. Tag templates by exam track so students only see relevant ones.
alter table public.schedule_templates
  add column if not exists exam_track text not null default 'step1' check (exam_track in ('step1', 'subject'));

alter table public.schedule_templates
  add column if not exists subject_name text;
