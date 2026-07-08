-- USMLE Step 1 Planner - database schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  exam_date date,
  prep_stage text check (prep_stage in ('beginning', 'middle', 'end')),
  daily_hour_goal numeric,
  resources text[] default '{}',
  ai_instructions text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  tasks jsonb not null default '[]',
  hours_studied numeric,
  topics_skipped text,
  notes text,
  rating int check (rating between 0 and 10),
  marked_complete boolean default false,
  ai_feedback jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, log_date)
);

alter table public.daily_logs enable row level security;

create policy "Users can view their own logs"
  on public.daily_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own logs"
  on public.daily_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own logs"
  on public.daily_logs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own logs"
  on public.daily_logs for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_daily_logs_updated_at on public.daily_logs;
create trigger set_daily_logs_updated_at
  before update on public.daily_logs
  for each row execute procedure public.set_updated_at();

create index if not exists daily_logs_user_date_idx
  on public.daily_logs (user_id, log_date desc);
