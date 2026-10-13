create or replace function public.submit_attendance(target_session uuid, entered_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_attempt uuid;
  -- Temporary testing bypass. Set true to restore the 30-minute / 2-hour window before deployment.
  enforce_checkin_window constant boolean := false;
begin
  if current_user_id is null then raise exception 'Sign in is required'; end if;
  if not exists(
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=current_user_id and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data -> 'providers' ? 'google',false)
      and p.role='student'
  ) then raise exception 'A verified student Google account is required'; end if;
  if not exists(
    select 1 from public.sessions s join public.group_members gm on gm.group_id=s.group_id
    where s.id=target_session and gm.student_id=current_user_id and s.closed_at is null
      and (not enforce_checkin_window or now() between s.starts_at-interval '30 minutes' and s.ends_at+interval '2 hours')
  ) then raise exception 'This session is not accepting check-ins'; end if;
  if not exists(
    select 1 from public.session_codes sc
    where sc.session_id=target_session
      and (not enforce_checkin_window or sc.expires_at>now())
      and sc.code_hash=encode(extensions.digest(upper(trim(entered_code)),'sha256'),'hex')
  ) then raise exception 'That check-in code is not valid'; end if;
  insert into public.attendance_attempts(session_id,student_id)
  values(target_session,current_user_id) returning id into created_attempt;
  return created_attempt;
exception when unique_violation then
  raise exception 'You have already checked in to this session';
end;
$$;
revoke all on function public.submit_attendance(uuid,text) from public,anon;
grant execute on function public.submit_attendance(uuid,text) to authenticated;
