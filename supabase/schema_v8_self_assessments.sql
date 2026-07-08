-- USMLE Step 1 Planner - self-assessments (timed practice tests)
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

-- Make sure the admin-check helper exists (safe to re-run even if it
-- already does - some earlier migrations created this by hand).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 1. Assessments - authored by the coach, each with its own question bank
--    and a single overall time limit.
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  time_limit_minutes int not null default 60,
  -- Array of: { id, question, choices: [{id, text}], correct_choice_id, explanation }
  questions jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assessments enable row level security;
grant select on public.assessments to authenticated;
grant insert, update, delete on public.assessments to authenticated;

drop policy if exists "Authenticated users can view assessments" on public.assessments;
create policy "Authenticated users can view assessments"
  on public.assessments for select
  to authenticated
  using (true);

drop policy if exists "Admins can insert assessments" on public.assessments;
create policy "Admins can insert assessments"
  on public.assessments for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update assessments" on public.assessments;
create policy "Admins can update assessments"
  on public.assessments for update
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can delete assessments" on public.assessments;
create policy "Admins can delete assessments"
  on public.assessments for delete
  to authenticated
  using (public.is_admin());

drop trigger if exists set_assessments_updated_at on public.assessments;
create trigger set_assessments_updated_at
  before update on public.assessments
  for each row execute procedure public.set_updated_at();

-- 2. Attempts - one row per student per time they take (or retake) an assessment.
create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- Map of question id -> chosen choice id
  answers jsonb not null default '{}',
  score_correct int not null default 0,
  score_total int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.assessment_attempts enable row level security;
grant select, insert on public.assessment_attempts to authenticated;

drop policy if exists "Students can view their own attempts" on public.assessment_attempts;
create policy "Students can view their own attempts"
  on public.assessment_attempts for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Students can insert their own attempts" on public.assessment_attempts;
create policy "Students can insert their own attempts"
  on public.assessment_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

create index if not exists assessment_attempts_user_idx
  on public.assessment_attempts (user_id, assessment_id);

create index if not exists assessment_attempts_assessment_idx
  on public.assessment_attempts (assessment_id);
