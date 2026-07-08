-- USMLE Step 1 Planner - multi-day templates + block score tracking
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

-- 1. Track which calendar date a student's assigned template sequence starts on.
alter table public.profiles
  add column if not exists assigned_template_start_date date;

-- 2. Let students log per-block scores each day (resource, question count, % correct).
alter table public.daily_logs
  add column if not exists block_scores jsonb not null default '[]';

-- 3. Let admins write into any student's daily_logs (needed for the
-- "push this template to their day, right now" admin override).
drop policy if exists "Admins can insert any daily logs" on public.daily_logs;
create policy "Admins can insert any daily logs"
  on public.daily_logs for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update any daily logs" on public.daily_logs;
create policy "Admins can update any daily logs"
  on public.daily_logs for update
  to authenticated
  using (public.is_admin());
