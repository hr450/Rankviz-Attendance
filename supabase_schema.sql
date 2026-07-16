-- RankViz Attendance — full schema
-- Run this in Supabase SQL editor. Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

create extension if not exists "pgcrypto";

/* ---------------- employees ---------------- */
create table if not exists employees (
  id text primary key,
  name text not null,
  department text not null,
  employment_type text not null default 'Full-time',
  shift_start text not null default '09:30',
  shift_end text not null default '18:30',
  zk_user_id text,
  created_at timestamptz default now()
);

/* ---------------- attendance ---------------- */
create table if not exists attendance (
  employee_id text not null references employees(id) on delete cascade,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  type text not null default 'office',           -- office | wfh | leave
  source text default 'web',
  wfh_check_in timestamptz,
  wfh_check_out timestamptz,
  alternate_day boolean not null default false,   -- worked this day to make up for a leave
  leave_reason text,
  primary key (employee_id, date)
);

alter table attendance add column if not exists wfh_check_in timestamptz;
alter table attendance add column if not exists wfh_check_out timestamptz;
alter table attendance add column if not exists alternate_day boolean not null default false;
alter table attendance add column if not exists leave_reason text;

-- Split-shift support: some employees work a normal day shift (~9-4) and then
-- come back for a second, shorter session at night (~2-3 hours). The device
-- and Supabase row only ever had ONE check_in/check_out pair, so that second
-- session's punches were silently dropped as "duplicate". These columns give
-- every employee a second, independent session for the same date.
alter table attendance add column if not exists second_check_in timestamptz;
alter table attendance add column if not exists second_check_out timestamptz;

-- Already referenced by api/iclock/cdata.js and api/attendance/edit.js, but
-- missing from this schema file — adding them here so a fresh database
-- (or anyone re-running this file to check for drift) actually has them.
alter table attendance add column if not exists manually_edited boolean not null default false;
alter table attendance add column if not exists edited_by text;
alter table attendance add column if not exists edited_at timestamptz;
alter table attendance add column if not exists notes text;

/* ---------------- app_users (HR admin + employee logins) ---------------- */
create table if not exists app_users (
  id text primary key,
  username text not null unique,
  password text not null,          -- demo-grade plain storage; swap for Supabase Auth in production
  role text not null check (role in ('admin', 'employee')),
  name text,
  employee_id text references employees(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_app_users_employee_id on app_users(employee_id);

/* ---------------- Row Level Security ----------------
   The anon key is public. Enable RLS + permissive policies so the app works,
   then tighten as needed (e.g. restrict app_users reads to password-less columns
   via a view, once you move auth server-side). */
alter table employees enable row level security;
alter table attendance enable row level security;
alter table app_users enable row level security;

drop policy if exists "employees_all" on employees;
create policy "employees_all" on employees for all using (true) with check (true);

drop policy if exists "attendance_all" on attendance;
create policy "attendance_all" on attendance for all using (true) with check (true);

drop policy if exists "app_users_all" on app_users;
create policy "app_users_all" on app_users for all using (true) with check (true);
