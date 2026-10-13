-- Spike In foundation schema. Apply with the Supabase CLI to a new project.
create extension if not exists pgcrypto with schema extensions;

create type public.profile_role as enum ('coach', 'student');
create type public.session_type as enum ('practice', 'game', 'tournament');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  role public.profile_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  type public.session_type not null default 'practice',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sessions_end_after_start check (ends_at > starts_at)
);

-- A code is validated through an RPC in a future migration; store only its digest.
create table public.session_codes (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_group_starts_idx on public.sessions(group_id, starts_at desc);
create index group_members_student_idx on public.group_members(student_id);

create function public.owns_group(target_group uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.groups g where g.id = target_group and g.owner_id = (select auth.uid())) $$;

create function public.is_group_member(target_group uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.group_members gm where gm.group_id = target_group and gm.student_id = (select auth.uid())) $$;

create function public.create_student_profile(profile_name text)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare created public.profiles;
begin
  if auth.uid() is null or char_length(trim(profile_name)) not between 1 and 120
    or coalesce((auth.jwt() ->> 'email_verified')::boolean, false) is not true then
    raise exception 'A Google-verified email and valid profile name are required';
  end if;
  insert into public.profiles(id, full_name, role)
  values (auth.uid(), trim(profile_name), 'student')
  returning * into created;
  return created;
end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_codes enable row level security;

create policy "profile owner reads profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "coach reads their group members profiles" on public.profiles for select to authenticated using (exists (select 1 from public.group_members gm where gm.student_id = profiles.id and public.owns_group(gm.group_id)));
create policy "profile owner updates own name" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()) and role = (select p.role from public.profiles p where p.id = (select auth.uid())));

create policy "coach reads owned groups" on public.groups for select to authenticated using (owner_id = (select auth.uid()));
create policy "members read joined groups" on public.groups for select to authenticated using (public.is_group_member(id));
create policy "coach creates owned group" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach'));
create policy "coach updates owned groups" on public.groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "coach deletes owned groups" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

create policy "coach reads group membership" on public.group_members for select to authenticated using (public.owns_group(group_id));
create policy "student reads own memberships" on public.group_members for select to authenticated using (student_id = (select auth.uid()));
create policy "coach adds group membership" on public.group_members for insert to authenticated with check (public.owns_group(group_id));
create policy "coach removes group membership" on public.group_members for delete to authenticated using (public.owns_group(group_id));

create policy "group participants read sessions" on public.sessions for select to authenticated using (public.owns_group(group_id) or public.is_group_member(group_id));
create policy "coach creates sessions" on public.sessions for insert to authenticated with check (public.owns_group(group_id));
create policy "coach updates sessions" on public.sessions for update to authenticated using (public.owns_group(group_id)) with check (public.owns_group(group_id));
create policy "coach deletes sessions" on public.sessions for delete to authenticated using (public.owns_group(group_id));

create policy "coach manages session codes" on public.session_codes for all to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and public.owns_group(s.group_id)))
  with check (exists (select 1 from public.sessions s where s.id = session_id and public.owns_group(s.group_id)));

revoke all on function public.owns_group(uuid) from public;
revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.create_student_profile(text) from public;
grant execute on function public.owns_group(uuid) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.create_student_profile(text) to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.session_codes to authenticated;
