-- USMLE Step 1 Planner - students can build their own day-by-day plan
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

-- 1. One personal plan per student (same day-by-day TemplateDay[] shape as
--    schedule_templates.tasks, just owned by the student instead of the coach).
create table if not exists public.personal_templates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null default 'My plan',
  tasks jsonb not null default '[]',
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personal_templates enable row level security;

drop policy if exists "own personal template select" on public.personal_templates;
create policy "own personal template select" on public.personal_templates
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own personal template insert" on public.personal_templates;
create policy "own personal template insert" on public.personal_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "own personal template update" on public.personal_templates;
create policy "own personal template update" on public.personal_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Which plan is currently "active" for the student - the coach's assigned
--    plan, or their own. Defaults to the coach's plan so nothing changes for
--    existing students until they actively switch.
alter table public.profiles
  add column if not exists active_plan_source text not null default 'coach'
    check (active_plan_source in ('coach', 'own'));
