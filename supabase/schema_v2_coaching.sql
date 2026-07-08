-- USMLE Step 1 Planner - coaching/admin features migration
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run
-- (Run this AFTER the original schema.sql)

-- 1. Mark admins on profiles, and let a profile point at an assigned template
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.profiles
  add column if not exists assigned_template_id uuid;

-- Denormalize email onto profiles so admins can see who's who without
-- needing service-role access to auth.users.
alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. Schedule templates - authored by you (the admin), assignable to students
create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage text not null check (stage in ('beginning', 'middle', 'end')),
  hour_goal numeric,
  resource_tags text[] default '{}',
  remote_friendly boolean default false,
  notes text,
  tasks jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
  add constraint profiles_assigned_template_fk
  foreign key (assigned_template_id) references public.schedule_templates(id) on delete set null;

alter table public.schedule_templates enable row level security;

grant usage on schema public to authenticated, anon;
grant select on public.schedule_templates to authenticated;
grant insert, update, delete on public.schedule_templates to authenticated;

-- Any signed-in student can read templates (needed so their dashboard can
-- load the tasks from whichever template you assign them).
create policy "Authenticated users can view templates"
  on public.schedule_templates for select
  to authenticated
  using (true);

-- Only admins can create/edit/delete templates.
create policy "Admins can insert templates"
  on public.schedule_templates for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Admins can update templates"
  on public.schedule_templates for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Admins can delete templates"
  on public.schedule_templates for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop trigger if exists set_schedule_templates_updated_at on public.schedule_templates;
create trigger set_schedule_templates_updated_at
  before update on public.schedule_templates
  for each row execute procedure public.set_updated_at();

-- 3. Let admins read and update every student's profile (to assign templates)
-- and every student's daily_logs (to review progress).
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Admins can update all profiles"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Admins can view all daily logs"
  on public.daily_logs for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- 4. Coach <-> student messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  sender text not null check (sender in ('coach', 'student')),
  body text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;
grant select, insert on public.messages to authenticated;

create policy "Students can view their own messages"
  on public.messages for select
  to authenticated
  using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Students can send their own messages"
  on public.messages for insert
  to authenticated
  with check (
    (student_id = auth.uid() and sender = 'student')
    or (
      sender = 'coach'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
    )
  );

create index if not exists messages_student_idx
  on public.messages (student_id, created_at desc);

-- 5. Finally, make yourself an admin (replace the email if needed):
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'cherryyeshmith84@gmail.com');
