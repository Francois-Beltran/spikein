create or replace function public.submit_attendance(target_session uuid, entered_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_attempt uuid;
  enforce_checkin_window constant boolean := true;
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
      and (not enforce_checkin_window or now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '2 hours')
  ) then raise exception 'This session is not accepting check-ins'; end if;
  if not exists (
    select 1 from public.session_codes sc
    where sc.session_id = target_session
      and (not enforce_checkin_window or sc.expires_at > now())
      and sc.code_hash = encode(extensions.digest(upper(trim(entered_code)), 'sha256'), 'hex')
  ) then raise exception 'That check-in code is not valid'; end if;
  insert into public.attendance_attempts(session_id, student_id)
  values (target_session, current_user_id)
  returning id into created_attempt;
  return created_attempt;
exception when unique_violation then
  raise exception 'You have already checked in to this session';
end;
$$;

revoke all on function public.submit_attendance(uuid, text) from public, anon;
grant execute on function public.submit_attendance(uuid, text) to authenticated;

create or replace function public.mark_student_present(target_session uuid, target_student uuid)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_row public.sessions;
  result public.attendance_records;
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
  if not exists (
    select 1 from public.group_members gm
    join public.profiles p on p.id = gm.student_id and p.role = 'student'
    where gm.group_id = session_row.group_id and gm.student_id = target_student
  ) then raise exception 'Student is not on this team roster'; end if;

  update public.attendance_attempts
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_coach,
      coach_note = 'Marked present manually by coach'
  where session_id = target_session
    and student_id = target_student
    and status = 'pending';

  insert into public.attendance_records(session_id, student_id, status, attempt_id, recorded_by)
  values (
    target_session,
    target_student,
    case when now() > session_row.starts_at then 'late'::public.attendance_record_status else 'present'::public.attendance_record_status end,
    null,
    current_coach
  )
  on conflict (session_id, student_id) do update
    set status = excluded.status,
        attempt_id = null,
        recorded_at = now(),
        recorded_by = current_coach
  returning * into result;

  return result;
end;
$$;

revoke all on function public.mark_student_present(uuid, uuid) from public, anon;
grant execute on function public.mark_student_present(uuid, uuid) to authenticated;
