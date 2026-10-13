create or replace function public.invite_team_member(target_group uuid, member_email text)
returns table(invitation_id uuid, team_name text, email text, invite_status public.invitation_status, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(trim(member_email)); member_user uuid; member_role public.profile_role;
begin
  if auth.uid() is null or not public.owns_group(target_group) then raise exception 'You do not manage this team'; end if;
  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  perform 1 from public.groups g where g.id = target_group for update;
  select u.id, p.role into member_user, member_role from auth.users u left join public.profiles p on p.id = u.id where lower(u.email) = normalized_email and u.email_confirmed_at is not null and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false);
  if member_user is not null and member_role = 'coach'::public.profile_role then raise exception 'Only student Google accounts can join a team'; end if;
  if member_user is null or member_role is null then
    if (select count(*) from public.group_members gm where gm.group_id = target_group) + (select count(*) from public.group_invitations gi where gi.group_id = target_group and gi.status = 'pending' and gi.expires_at > now() and gi.email <> normalized_email) >= 20 then raise exception 'This team has reached its 20 player limit'; end if;
    insert into public.group_invitations(group_id, email, invited_by) values (target_group, normalized_email, (select auth.uid()))
    on conflict (group_id, email) do update set status='pending', invited_by=excluded.invited_by, created_at=now(), expires_at=now()+interval '30 days', accepted_at=null;
  else
    if not exists (select 1 from public.group_members gm where gm.group_id=target_group and gm.student_id=member_user)
       and (select count(*) from public.group_members gm where gm.group_id=target_group) + (select count(*) from public.group_invitations gi where gi.group_id=target_group and gi.status = 'pending' and gi.expires_at > now() and gi.email <> normalized_email) >= 20 then raise exception 'This team has reached its 20 player limit'; end if;
    insert into public.group_members(group_id, student_id) values (target_group, member_user) on conflict do nothing;
    insert into public.group_invitations(group_id, email, status, invited_by, accepted_at) values (target_group, normalized_email, 'accepted', (select auth.uid()), now()) on conflict (group_id, email) do update set status='accepted', invited_by=excluded.invited_by, accepted_at=now();
  end if;
  return query select gi.id, g.name, gi.email, gi.status, gi.expires_at from public.group_invitations gi join public.groups g on g.id=gi.group_id where gi.group_id=target_group and gi.email=normalized_email;
end; $$;

create or replace function public.review_attendance_attempt(target_attempt uuid, approved boolean, coach_note text default null)
returns public.attendance_records language plpgsql security definer set search_path = '' as $$
declare attempt public.attendance_attempts; session_row public.sessions; result public.attendance_records;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select a.* into attempt from public.attendance_attempts a where a.id=target_attempt for update;
  if attempt.id is null then raise exception 'Check-in not found'; end if;
  select s.* into session_row from public.sessions s where s.id=attempt.session_id;
  if not public.owns_group(session_row.group_id) then raise exception 'You do not manage this session'; end if;
  if session_row.closed_at is not null then raise exception 'This session is already closed'; end if;
  if attempt.status<>'pending' then raise exception 'This check-in has already been reviewed'; end if;
  if char_length(coalesce(coach_note,''))>500 then raise exception 'Note must be 500 characters or fewer'; end if;
  update public.attendance_attempts set status=case when approved then 'approved'::public.attendance_attempt_status else 'rejected'::public.attendance_attempt_status end, reviewed_at=now(), reviewed_by=(select auth.uid()), coach_note=nullif(trim(coach_note),'') where id=target_attempt;
  if approved then
    insert into public.attendance_records(session_id,student_id,status,attempt_id,recorded_by) values(attempt.session_id,attempt.student_id,case when attempt.submitted_at>session_row.starts_at then 'late'::public.attendance_record_status else 'present'::public.attendance_record_status end,target_attempt,(select auth.uid()))
    on conflict(session_id,student_id) do update set status=excluded.status,attempt_id=excluded.attempt_id,recorded_at=now(),recorded_by=excluded.recorded_by returning * into result;
  end if;
  return result;
end; $$;

create or replace function public.close_attendance_session(target_session uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare session_group uuid; inserted_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select s.group_id into session_group from public.sessions s where s.id=target_session and s.ends_at+interval '2 hours'<=now() for update;
  if session_group is null then raise exception 'Attendance can be closed two hours after the session ends'; end if;
  if not public.owns_group(session_group) then raise exception 'You do not manage this session'; end if;
  update public.sessions set closed_at=coalesce(closed_at,now()) where id=target_session;
  update public.attendance_attempts set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),coach_note='Session closed before review' where session_id=target_session and status='pending';
  insert into public.attendance_records(session_id,student_id,status,recorded_by)
  select target_session,gm.student_id,'absent',(select auth.uid()) from public.group_members gm where gm.group_id=session_group
  on conflict(session_id,student_id) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end; $$;

-- Keep schema helpers private to authenticated RLS evaluation; event triggers are never API endpoints.
revoke execute on function public.owns_group(uuid) from anon;
revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

