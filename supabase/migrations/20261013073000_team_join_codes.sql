create table public.team_join_codes (
  group_id uuid primary key references public.groups(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.team_join_codes enable row level security;
revoke all on table public.team_join_codes from anon, authenticated;

create or replace function public.create_team_join_code(target_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare generated_code text := upper(encode(extensions.gen_random_bytes(6), 'hex'));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  ) or not public.owns_group(target_group) then
    raise exception 'You do not manage this team';
  end if;

  insert into public.team_join_codes(group_id, code_hash, created_by)
  values (target_group, encode(extensions.digest(generated_code, 'sha256'), 'hex'), (select auth.uid()))
  on conflict (group_id) do update
    set code_hash = excluded.code_hash, created_by = excluded.created_by, created_at = now();

  return generated_code;
end;
$$;

create or replace function public.join_team_with_code(entered_code text)
returns table(group_id uuid, team_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(entered_code));
  target_group uuid;
  current_team_name text;
  existing_member boolean;
  member_count integer;
begin
  if current_user_id is null then raise exception 'Sign in is required'; end if;
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = current_user_id
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false)
      and p.role = 'student'
  ) then raise exception 'A verified student Google account is required'; end if;
  if normalized_code !~ '^[A-F0-9]{12}$' then raise exception 'Enter a valid 12-character team code'; end if;

  select c.group_id into target_group
  from public.team_join_codes c
  where c.code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex');
  if target_group is null then raise exception 'Team code not found. Check it and try again.'; end if;

  perform 1 from public.groups g where g.id = target_group for update;
  if not found or not exists (
    select 1 from public.team_join_codes c
    where c.group_id = target_group
      and c.code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex')
  ) then raise exception 'Team code is no longer valid'; end if;

  select g.name into current_team_name from public.groups g where g.id = target_group;
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group and gm.student_id = current_user_id
  ) into existing_member;
  if not existing_member then
    select count(*) into member_count from public.group_members gm where gm.group_id = target_group;
    if member_count >= 20 then raise exception 'This team is full'; end if;
    insert into public.group_members(group_id, student_id)
    values (target_group, current_user_id)
    on conflict do nothing;
  end if;

  return query select target_group, current_team_name;
end;
$$;

revoke all on function public.create_team_join_code(uuid) from public, anon;
revoke all on function public.join_team_with_code(text) from public, anon;
grant execute on function public.create_team_join_code(uuid) to authenticated;
grant execute on function public.join_team_with_code(text) to authenticated;

drop function public.invite_team_member(uuid, text);
drop function public.claim_team_invitations();
drop table public.group_invitations;
drop type public.invitation_status;
