-- A check-in is late only when it happens more than two hours after the session ends.
-- Correct existing records that were marked late using the old session-start rule.
update public.attendance_records ar
set status = 'present'
where ar.status = 'late'
  and exists (
    select 1
    from public.sessions s
    left join public.attendance_attempts aa on aa.id = ar.attempt_id
    where s.id = ar.session_id
      and (
        (ar.attempt_id is not null and aa.submitted_at <= s.ends_at + interval '2 hours')
        or (ar.attempt_id is null and ar.recorded_at <= s.ends_at + interval '2 hours')
      )
  );

create or replace function public.review_attendance_attempt(target_attempt uuid, approved boolean, coach_note text default null)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.attendance_attempts;
  session_row public.sessions;
  result public.attendance_records;
  normalized_note text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  select a.* into attempt
  from public.attendance_attempts a
  where a.id = target_attempt
  for update;
  if attempt.id is null then raise exception 'Check-in not found'; end if;

  select s.* into session_row
  from public.sessions s
  where s.id = attempt.session_id;
  if not public.owns_group(session_row.group_id) then raise exception 'You do not manage this session'; end if;
  if session_row.closed_at is not null then raise exception 'This session is already closed'; end if;
  if attempt.status <> 'pending' then raise exception 'This check-in has already been reviewed'; end if;
  if char_length(coalesce(coach_note, '')) > 500 then raise exception 'Note must be 500 characters or fewer'; end if;

  normalized_note := nullif(trim(coach_note), '');
  update public.attendance_attempts as aa
  set status = case when approved then 'approved'::public.attendance_attempt_status else 'rejected'::public.attendance_attempt_status end,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      coach_note = normalized_note
  where aa.id = target_attempt;

  if approved then
    insert into public.attendance_records(session_id, student_id, status, attempt_id, recorded_by)
    values (
      attempt.session_id,
      attempt.student_id,
      case when attempt.submitted_at > session_row.ends_at + interval '2 hours' then 'late'::public.attendance_record_status else 'present'::public.attendance_record_status end,
      target_attempt,
      (select auth.uid())
    )
    on conflict (session_id, student_id) do update
      set status = excluded.status,
          attempt_id = excluded.attempt_id,
          recorded_at = now(),
          recorded_by = excluded.recorded_by
    returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.review_attendance_attempt(uuid, boolean, text) from public, anon;
grant execute on function public.review_attendance_attempt(uuid, boolean, text) to authenticated;

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
    case when now() > session_row.ends_at + interval '2 hours' then 'late'::public.attendance_record_status else 'present'::public.attendance_record_status end,
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

revoke all on function public.mark_student_present(uuid, uuid) from public, anon;
grant execute on function public.mark_student_present(uuid, uuid) to authenticated;
