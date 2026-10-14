alter table public.sessions
  add column if not exists checkin_override_enabled boolean not null default false;

create or replace function public.submit_attendance(target_session uuid, entered_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_attempt uuid;
begin
  if current_user_id is null then raise exception 'Sign in is required'; end if;
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = current_user_id
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false)
      and p.role = 'student'
  ) then raise exception 'A verified student Google account is required'; end if;
  if not exists (
    select 1 from public.sessions s
    join public.group_members gm on gm.group_id = s.group_id
    where s.id = target_session
      and gm.student_id = current_user_id
      and s.closed_at is null
      and (s.checkin_override_enabled or now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '2 hours')
  ) then raise exception 'This session is not accepting check-ins'; end if;
  if not exists (
    select 1 from public.session_codes sc
    join public.sessions s on s.id = sc.session_id
    where sc.session_id = target_session
      and (s.checkin_override_enabled or sc.expires_at > now())
      and sc.code_hash = encode(extensions.digest(upper(trim(entered_code)), 'sha256'), 'hex')
  ) then raise exception 'That check-in code is not valid'; end if;

  insert into public.attendance_attempts as existing(session_id, student_id)
  values (target_session, current_user_id)
  on conflict (session_id, student_id) do update
    set status = 'pending',
        submitted_at = now(),
        reviewed_at = null,
        reviewed_by = null,
        coach_note = null
    where existing.status = 'rejected'
      and existing.coach_note = 'Session closed before review'
  returning id into created_attempt;
  if created_attempt is null then raise exception 'You have already checked in to this session'; end if;
  return created_attempt;
end;
$$;

revoke all on function public.submit_attendance(uuid, text) from public, anon;
grant execute on function public.submit_attendance(uuid, text) to authenticated;

create or replace function public.reopen_attendance_session(target_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_row public.sessions;
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  select s.* into session_row
  from public.sessions s
  where s.id = target_session
  for update;
  if session_row.id is null then raise exception 'Session not found'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = current_coach and p.role = 'coach'
  ) or not public.owns_group(session_row.group_id) then
    raise exception 'You do not manage this session';
  end if;
  if session_row.closed_at is null then raise exception 'This session is already open'; end if;

  update public.sessions
  set closed_at = null,
      checkin_override_enabled = false
  where id = target_session;
end;
$$;

revoke all on function public.reopen_attendance_session(uuid) from public, anon;
grant execute on function public.reopen_attendance_session(uuid) to authenticated;

create or replace function public.set_session_checkin_override(target_session uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  target_group uuid;
  session_closed timestamptz;
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  select s.group_id, s.closed_at into target_group, session_closed
  from public.sessions s
  where s.id = target_session
  for update;
  if target_group is null then raise exception 'Session not found'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = current_coach and p.role = 'coach'
  ) or not public.owns_group(target_group) then
    raise exception 'You do not manage this session';
  end if;
  if session_closed is not null then raise exception 'Reopen the session before changing check-in access'; end if;
  update public.sessions set checkin_override_enabled = enabled where id = target_session;
end;
$$;

revoke all on function public.set_session_checkin_override(uuid, boolean) from public, anon;
grant execute on function public.set_session_checkin_override(uuid, boolean) to authenticated;

create or replace function public.close_attendance_session(target_session uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_group uuid;
  inserted_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select s.group_id into session_group
  from public.sessions s
  where s.id = target_session
    and s.ends_at + interval '2 hours' <= now()
  for update;
  if session_group is null then raise exception 'Attendance can be closed two hours after the session ends'; end if;
  if not public.owns_group(session_group) then raise exception 'You do not manage this session'; end if;

  update public.sessions
  set closed_at = coalesce(closed_at, now()),
      checkin_override_enabled = false
  where id = target_session;
  update public.attendance_attempts
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      coach_note = 'Session closed before review'
  where session_id = target_session and status = 'pending';
  insert into public.attendance_records(session_id, student_id, status, recorded_by)
  select target_session, gm.student_id, 'absent', (select auth.uid())
  from public.group_members gm
  where gm.group_id = session_group
  on conflict (session_id, student_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.close_attendance_session(uuid) from public, anon;
grant execute on function public.close_attendance_session(uuid) to authenticated;
