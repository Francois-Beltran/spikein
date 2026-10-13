create or replace function public.rotate_session_code(target_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  target_group uuid;
  session_end timestamptz;
  session_closed timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select s.group_id,s.ends_at,s.closed_at into target_group,session_end,session_closed
  from public.sessions s where s.id=target_session for update;
  if target_group is null then raise exception 'Session not found'; end if;
  if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='coach') or not public.owns_group(target_group) then
    raise exception 'You do not manage this session';
  end if;
  if session_closed is not null then raise exception 'This session is closed'; end if;
  if now()>session_end+interval '2 hours' then raise exception 'The check-in window has ended'; end if;

  insert into public.session_codes(session_id,code_hash,expires_at)
  values(target_session,encode(extensions.digest(new_code,'sha256'),'hex'),session_end+interval '2 hours')
  on conflict (session_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_at=now();
  return new_code;
end;
$$;

create or replace function public.delete_team_session(target_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select s.group_id into target_group from public.sessions s where s.id=target_session for update;
  if target_group is null then raise exception 'Session not found'; end if;
  if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='coach') or not public.owns_group(target_group) then
    raise exception 'You do not manage this session';
  end if;
  delete from public.sessions where id=target_session;
end;
$$;

revoke all on function public.rotate_session_code(uuid) from public,anon;
revoke all on function public.delete_team_session(uuid) from public,anon;
grant execute on function public.rotate_session_code(uuid) to authenticated;
grant execute on function public.delete_team_session(uuid) to authenticated;

create policy "students read memberships in joined teams" on public.group_members
for select to authenticated
using (public.is_group_member(group_id));

create policy "students read profiles of teammates" on public.profiles
for select to authenticated
using (exists(
  select 1 from public.group_members teammate
  where teammate.student_id=profiles.id
    and public.is_group_member(teammate.group_id)
));

