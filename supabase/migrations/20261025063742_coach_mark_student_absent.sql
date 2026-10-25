create or replace function public.mark_student_absent(target_session uuid, target_student uuid)
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
    select 1
    from public.group_members gm
    join public.profiles p on p.id = gm.student_id and p.role = 'student'
    where gm.group_id = session_row.group_id
      and gm.student_id = target_student
  ) then
    raise exception 'Student is not on this team roster';
  end if;

  update public.attendance_attempts aa
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = current_coach,
      coach_note = 'Marked absent manually by coach'
  where aa.session_id = target_session
    and aa.student_id = target_student
    and aa.status = 'pending';

  insert into public.attendance_records(session_id, student_id, status, attempt_id, recorded_by, reason)
  values (target_session, target_student, 'absent', null, current_coach, null)
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

revoke all on function public.mark_student_absent(uuid, uuid) from public, anon;
grant execute on function public.mark_student_absent(uuid, uuid) to authenticated;
