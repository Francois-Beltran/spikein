create table public.session_qr_shares (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  sharing_open boolean not null default false,
  token_hash text,
  token_expires_at timestamptz,
  constraint session_qr_shares_token_state_check check (
    (sharing_open and token_hash is not null and token_expires_at is not null)
    or (not sharing_open and token_hash is null and token_expires_at is null)
  )
);

alter table public.session_qr_shares enable row level security;
revoke all on table public.session_qr_shares from public, anon, authenticated;

create or replace function public.get_session_qr_sharing(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_group uuid;
  share_row public.session_qr_shares;
  current_coach uuid := auth.uid();
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  select s.group_id into session_group
  from public.sessions s
  where s.id = target_session;
  if session_group is null then raise exception 'Session not found'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = current_coach and p.role = 'coach'
  ) or not public.owns_group(session_group) then
    raise exception 'You do not manage this session';
  end if;

  select q.* into share_row
  from public.session_qr_shares q
  where q.session_id = target_session;

  return jsonb_build_object(
    'sharing_open', coalesce(share_row.sharing_open, false),
    'token_expires_at', share_row.token_expires_at
  );
end;
$$;

create or replace function public.open_session_qr_sharing(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_row public.sessions;
  new_token text := upper(encode(extensions.gen_random_bytes(24), 'hex'));
  token_expiry timestamptz;
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
  if session_row.closed_at is not null then raise exception 'This session is closed'; end if;
  if not session_row.checkin_override_enabled
     and now() not between session_row.starts_at - interval '30 minutes' and session_row.ends_at + interval '2 hours' then
    raise exception 'Check-in is not open yet';
  end if;

  token_expiry := case
    when session_row.checkin_override_enabled then now() + interval '60 seconds'
    else least(now() + interval '60 seconds', session_row.ends_at + interval '2 hours')
  end;

  insert into public.session_qr_shares(session_id, sharing_open, token_hash, token_expires_at)
  values (
    target_session,
    true,
    encode(extensions.digest(new_token, 'sha256'), 'hex'),
    token_expiry
  )
  on conflict (session_id) do update
    set sharing_open = true,
        token_hash = excluded.token_hash,
        token_expires_at = excluded.token_expires_at;

  return jsonb_build_object('sharing_open', true, 'qr_token', new_token, 'token_expires_at', token_expiry);
end;
$$;

create or replace function public.rotate_session_qr_token(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_row public.sessions;
  share_row public.session_qr_shares;
  new_token text := upper(encode(extensions.gen_random_bytes(24), 'hex'));
  token_expiry timestamptz;
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
  select q.* into share_row
  from public.session_qr_shares q
  where q.session_id = target_session
  for update;
  if not coalesce(share_row.sharing_open, false) then raise exception 'QR sharing is closed'; end if;
  if session_row.closed_at is not null then
    update public.session_qr_shares
    set sharing_open = false, token_hash = null, token_expires_at = null
    where session_id = target_session;
    return jsonb_build_object('sharing_open', false, 'qr_token', null, 'token_expires_at', null);
  end if;
  if not session_row.checkin_override_enabled
     and now() not between session_row.starts_at - interval '30 minutes' and session_row.ends_at + interval '2 hours' then
    update public.session_qr_shares
    set sharing_open = false, token_hash = null, token_expires_at = null
    where session_id = target_session;
    return jsonb_build_object('sharing_open', false, 'qr_token', null, 'token_expires_at', null);
  end if;

  token_expiry := case
    when session_row.checkin_override_enabled then now() + interval '60 seconds'
    else least(now() + interval '60 seconds', session_row.ends_at + interval '2 hours')
  end;
  update public.session_qr_shares
  set token_hash = encode(extensions.digest(new_token, 'sha256'), 'hex'),
      token_expires_at = token_expiry
  where session_id = target_session;

  return jsonb_build_object('sharing_open', true, 'qr_token', new_token, 'token_expires_at', token_expiry);
end;
$$;

create or replace function public.close_session_qr_sharing(target_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
  session_group uuid;
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  select s.group_id into session_group
  from public.sessions s
  where s.id = target_session
  for update;
  if session_group is null then raise exception 'Session not found'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = current_coach and p.role = 'coach'
  ) or not public.owns_group(session_group) then
    raise exception 'You do not manage this session';
  end if;

  update public.session_qr_shares
  set sharing_open = false, token_hash = null, token_expires_at = null
  where session_id = target_session;
end;
$$;

create or replace function public.submit_session_qr_attendance(target_session uuid, qr_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_student uuid := auth.uid();
  session_row public.sessions;
  share_row public.session_qr_shares;
  created_attempt uuid;
begin
  if current_student is null then raise exception 'Sign in is required'; end if;
  if not exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = current_student
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data -> 'providers' ? 'google', false)
      and p.role = 'student'
  ) then raise exception 'A verified student Google account is required'; end if;
  if qr_token is null or upper(qr_token) !~ '^[A-F0-9]{48}$' then
    raise exception 'This is not a valid Spike In QR code';
  end if;

  select s.* into session_row
  from public.sessions s
  join public.group_members gm on gm.group_id = s.group_id and gm.student_id = current_student
  where s.id = target_session
  for share of s;
  if session_row.id is null then raise exception 'You are not on this team roster'; end if;
  if session_row.closed_at is not null
     or (not session_row.checkin_override_enabled
         and now() not between session_row.starts_at - interval '30 minutes' and session_row.ends_at + interval '2 hours') then
    raise exception 'This session is not accepting check-ins';
  end if;

  select q.* into share_row
  from public.session_qr_shares q
  where q.session_id = target_session
    and q.sharing_open
    and q.token_expires_at > now()
    and q.token_hash = encode(extensions.digest(upper(qr_token), 'sha256'), 'hex')
  for share of q;
  if share_row.session_id is null then
    raise exception 'This QR code has expired or sharing is closed. Ask your coach to refresh the QR code.';
  end if;

  insert into public.attendance_attempts as existing(session_id, student_id)
  values (target_session, current_student)
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

create or replace function public.disable_session_qr_sharing_when_closed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.closed_at is not null and old.closed_at is distinct from new.closed_at then
    update public.session_qr_shares
    set sharing_open = false, token_hash = null, token_expires_at = null
    where session_id = new.id;
  end if;
  return new;
end;
$$;

create trigger sessions_close_qr_sharing
after update of closed_at on public.sessions
for each row
when (new.closed_at is not null and old.closed_at is distinct from new.closed_at)
execute function public.disable_session_qr_sharing_when_closed();

revoke all on function public.get_session_qr_sharing(uuid) from public, anon;
revoke all on function public.open_session_qr_sharing(uuid) from public, anon;
revoke all on function public.rotate_session_qr_token(uuid) from public, anon;
revoke all on function public.close_session_qr_sharing(uuid) from public, anon;
revoke all on function public.submit_session_qr_attendance(uuid, text) from public, anon;
revoke all on function public.disable_session_qr_sharing_when_closed() from public, anon, authenticated;
grant execute on function public.get_session_qr_sharing(uuid) to authenticated;
grant execute on function public.open_session_qr_sharing(uuid) to authenticated;
grant execute on function public.rotate_session_qr_token(uuid) to authenticated;
grant execute on function public.close_session_qr_sharing(uuid) to authenticated;
grant execute on function public.submit_session_qr_attendance(uuid, text) to authenticated;
