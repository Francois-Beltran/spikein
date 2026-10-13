create type public.invitation_status as enum ('pending', 'accepted', 'revoked');
create type public.attendance_attempt_status as enum ('pending', 'approved', 'rejected');
create type public.attendance_record_status as enum ('present', 'late', 'absent', 'excused');

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  unique (group_id, email)
);
create index group_invitations_group_status_idx on public.group_invitations(group_id, status);

create table public.attendance_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_attempt_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  coach_note text check (coach_note is null or char_length(coach_note) <= 500),
  unique (session_id, student_id)
);
create index attendance_attempts_session_status_idx on public.attendance_attempts(session_id, status);
create index attendance_attempts_student_submitted_idx on public.attendance_attempts(student_id, submitted_at desc);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_record_status not null,
  attempt_id uuid references public.attendance_attempts(id) on delete set null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  unique (session_id, student_id)
);
create index attendance_records_student_recorded_idx on public.attendance_records(student_id, recorded_at desc);

alter table public.group_invitations enable row level security;
alter table public.attendance_attempts enable row level security;
alter table public.attendance_records enable row level security;

create policy "Coach reads invitations for owned teams" on public.group_invitations for select to authenticated using (public.owns_group(group_id));
create policy "Coach revokes invitations for owned teams" on public.group_invitations for update to authenticated using (public.owns_group(group_id)) with check (public.owns_group(group_id));
create policy "Coach reads attendance attempts for owned sessions" on public.attendance_attempts for select to authenticated using (exists (select 1 from public.sessions s where s.id = session_id and public.owns_group(s.group_id)));
create policy "Students read own attendance attempts" on public.attendance_attempts for select to authenticated using (student_id = (select auth.uid()));
create policy "Coach reads attendance records for owned sessions" on public.attendance_records for select to authenticated using (exists (select 1 from public.sessions s where s.id = session_id and public.owns_group(s.group_id)));
create policy "Students read own attendance records" on public.attendance_records for select to authenticated using (student_id = (select auth.uid()));

grant select, update on public.group_invitations to authenticated;
grant select on public.attendance_attempts, public.attendance_records to authenticated;
revoke insert, update, delete on public.group_members from authenticated;
revoke insert, update, delete on public.sessions from authenticated;
revoke all on public.session_codes from authenticated;
grant select on public.sessions to authenticated;

create or replace function public.create_team(team_name text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare created public.groups;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach') then raise exception 'Coach access is required'; end if;
  if char_length(trim(team_name)) not between 1 and 120 then raise exception 'Team name must be between 1 and 120 characters'; end if;
  insert into public.groups(name, owner_id) values (trim(team_name), (select auth.uid())) returning * into created;
  return created;
end; $$;

create or replace function public.invite_team_member(target_group uuid, member_email text)
returns table(invitation_id uuid, team_name text, email text, invite_status public.invitation_status, invite_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(trim(member_email)); member_user uuid; member_role public.profile_role; created_invitation public.group_invitations;
begin
  if auth.uid() is null or not public.owns_group(target_group) then raise exception 'You do not manage this team'; end if;
  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  perform 1 from public.groups g where g.id = target_group for update;
  if (select count(*) from public.group_members gm where gm.group_id = target_group) + (select count(*) from public.group_invitations gi where gi.group_id = target_group and gi.status = 'pending' and gi.expires_at > now()) >= 20 then raise exception 'This team has reached its 20 player limit'; end if;
  select u.id, p.role into member_user, member_role from auth.users u left join public.profiles p on p.id = u.id where lower(u.email) = normalized_email and u.email_confirmed_at is not null and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false);
  if member_user is not null then
    if member_role is distinct from 'student'::public.profile_role then raise exception 'Only student Google accounts can join a team'; end if;
    insert into public.group_members(group_id, student_id) values (target_group, member_user) on conflict do nothing;
    insert into public.group_invitations(group_id, email, status, invited_by, accepted_at) values (target_group, normalized_email, 'accepted', (select auth.uid()), now()) on conflict (group_id, email) do update set status='accepted', invited_by=excluded.invited_by, accepted_at=now();
  else
    insert into public.group_invitations(group_id, email, invited_by) values (target_group, normalized_email, (select auth.uid())) on conflict (group_id, email) do update set status='pending', invited_by=excluded.invited_by, created_at=now(), expires_at=now()+interval '30 days', accepted_at=null returning * into created_invitation;
  end if;
  return query select gi.id, g.name, gi.email, gi.status, gi.expires_at from public.group_invitations gi join public.groups g on g.id=gi.group_id where gi.group_id=target_group and gi.email=normalized_email;
end; $$;

create or replace function public.claim_team_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare current_email text; current_role public.profile_role; claimed integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select lower(u.email), p.role into current_email, current_role from auth.users u join public.profiles p on p.id=u.id where u.id=(select auth.uid()) and u.email_confirmed_at is not null and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false);
  if current_email is null or current_role is distinct from 'student'::public.profile_role then return 0; end if;
  perform 1 from public.groups g join public.group_invitations gi on gi.group_id=g.id where gi.email=current_email and gi.status='pending' and gi.expires_at>now() for update of g;
  with available as (
    select gi.id, gi.group_id from public.group_invitations gi join public.groups g on g.id=gi.group_id
    where gi.email=current_email and gi.status='pending' and gi.expires_at>now()
      and (select count(*) from public.group_members gm where gm.group_id=gi.group_id)<20
    for update of gi skip locked
  ), added as (
    insert into public.group_members(group_id,student_id) select group_id,(select auth.uid()) from available on conflict do nothing returning group_id
  ), updated as (
    update public.group_invitations gi set status='accepted',accepted_at=now() from available a where gi.id=a.id and exists(select 1 from added where added.group_id=a.group_id) returning gi.id
  ) select count(*) into claimed from updated;
  return coalesce(claimed,0);
end; $$;

create or replace function public.create_session_with_code(target_group uuid, session_title text, session_kind public.session_type, session_start timestamptz, session_end timestamptz)
returns table(session_id uuid, check_in_code text) language plpgsql security definer set search_path = '' as $$
declare new_session uuid; new_code text;
begin
  if auth.uid() is null or not public.owns_group(target_group) then raise exception 'You do not manage this team'; end if;
  if char_length(trim(session_title)) not between 1 and 160 or session_end<=session_start then raise exception 'Enter a title and valid session times'; end if;
  insert into public.sessions(group_id,title,type,starts_at,ends_at) values(target_group,trim(session_title),session_kind,session_start,session_end) returning id into new_session;
  new_code:=upper(encode(extensions.gen_random_bytes(4),'hex'));
  insert into public.session_codes(session_id,code_hash,expires_at) values(new_session,encode(extensions.digest(new_code,'sha256'),'hex'),session_end+interval '2 hours');
  return query select new_session,new_code;
end; $$;

create or replace function public.submit_attendance(target_session uuid, entered_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); created_attempt uuid;
begin
  if current_user_id is null then raise exception 'Sign in is required'; end if;
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=current_user_id and u.email_confirmed_at is not null and coalesce(u.raw_app_meta_data -> 'providers' ? 'google',false) and p.role='student') then raise exception 'A verified student Google account is required'; end if;
  if not exists(select 1 from public.sessions s join public.group_members gm on gm.group_id=s.group_id where s.id=target_session and gm.student_id=current_user_id and s.closed_at is null and now() between s.starts_at-interval '30 minutes' and s.ends_at+interval '2 hours') then raise exception 'This session is not accepting check-ins'; end if;
  if not exists(select 1 from public.session_codes sc where sc.session_id=target_session and sc.expires_at>now() and sc.code_hash=encode(extensions.digest(upper(trim(entered_code)),'sha256'),'hex')) then raise exception 'That check-in code is not valid'; end if;
  insert into public.attendance_attempts(session_id,student_id) values(target_session,current_user_id) returning id into created_attempt;
  return created_attempt;
exception when unique_violation then raise exception 'You have already checked in to this session';
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
  select s.group_id into session_group from public.sessions s where s.id=target_session and s.ends_at<=now() for update;
  if session_group is null then raise exception 'Session has not ended yet'; end if;
  if not public.owns_group(session_group) then raise exception 'You do not manage this session'; end if;
  update public.sessions set closed_at=coalesce(closed_at,now()) where id=target_session;
  insert into public.attendance_records(session_id,student_id,status,recorded_by)
  select target_session,gm.student_id,'absent',(select auth.uid()) from public.group_members gm where gm.group_id=session_group
  on conflict(session_id,student_id) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end; $$;

revoke all on function public.create_team(text) from public, anon;
revoke all on function public.invite_team_member(uuid,text) from public, anon;
revoke all on function public.claim_team_invitations() from public, anon;
revoke all on function public.create_session_with_code(uuid,text,public.session_type,timestamptz,timestamptz) from public, anon;
revoke all on function public.submit_attendance(uuid,text) from public, anon;
revoke all on function public.review_attendance_attempt(uuid,boolean,text) from public, anon;
revoke all on function public.close_attendance_session(uuid) from public, anon;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.invite_team_member(uuid,text) to authenticated;
grant execute on function public.claim_team_invitations() to authenticated;
grant execute on function public.create_session_with_code(uuid,text,public.session_type,timestamptz,timestamptz) to authenticated;
grant execute on function public.submit_attendance(uuid,text) to authenticated;
grant execute on function public.review_attendance_attempt(uuid,boolean,text) to authenticated;
grant execute on function public.close_attendance_session(uuid) to authenticated;


