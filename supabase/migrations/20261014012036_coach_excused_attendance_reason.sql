alter table public.attendance_records
  add column if not exists reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_records_reason_length_check'
      and conrelid = 'public.attendance_records'::regclass
  ) then
    alter table public.attendance_records
      add constraint attendance_records_reason_length_check
      check (reason is null or char_length(trim(reason)) between 1 and 300);
  end if;
end;
$$;

create or replace function public.excuse_student_attendance(
  target_session uuid,
  target_student uuid,
  excuse_reason text
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_row public.sessions;
  existing_status public.attendance_record_status;
  normalized_reason text := nullif(trim(excuse_reason), '');
  result public.attendance_records;
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  if normalized_reason is null or char_length(normalized_reason) > 300 then
    raise exception 'Enter a short reason of 1 to 300 characters';
  end if;

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

  select ar.status into existing_status
  from public.attendance_records ar
  where ar.session_id = target_session and ar.student_id = target_student
  for update;
  if existing_status in ('present', 'late') then
    raise exception 'Student is already marked present';
  end if;

  update public.attendance_attempts aa
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_coach,
      coach_note = 'Excused by coach: ' || normalized_reason
  where aa.session_id = target_session
    and aa.student_id = target_student
    and aa.status = 'pending';

  insert into public.attendance_records(session_id, student_id, status, attempt_id, recorded_by, reason)
  values (target_session, target_student, 'excused', null, current_coach, normalized_reason)
  on conflict (session_id, student_id) do update
    set status = 'excused',
        attempt_id = null,
        recorded_at = now(),
        recorded_by = current_coach,
        reason = normalized_reason
  returning * into result;

  return result;
end;
$$;

revoke all on function public.excuse_student_attendance(uuid, uuid, text) from public, anon;
grant execute on function public.excuse_student_attendance(uuid, uuid, text) to authenticated;

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

  update public.attendance_attempts aa
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_coach,
      coach_note = 'Marked present manually by coach'
  where aa.session_id = target_session
    and aa.student_id = target_student
    and aa.status = 'pending';

  insert into public.attendance_records(session_id, student_id, status, attempt_id, recorded_by, reason)
  values (
    target_session,
    target_student,
    case when now() > session_row.starts_at then 'late'::public.attendance_record_status else 'present'::public.attendance_record_status end,
    null,
    current_coach,
    null
  )
  on conflict (session_id, student_id) do update
    set status = excluded.status,
        attempt_id = null,
        recorded_at = now(),
        recorded_by = current_coach,
        reason = null
  returning * into result;

  return result;
end;
$$;
