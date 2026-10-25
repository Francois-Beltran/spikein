drop function public.create_session_with_code(
  uuid,
  text,
  public.session_type,
  timestamptz,
  timestamptz
);

alter table public.sessions
  alter column type drop default;

alter table public.sessions
  alter column type type text using type::text;

alter table public.sessions
  alter column type set default 'practice';

create function public.create_session_with_code(
  target_group uuid,
  session_title text,
  session_kind text,
  session_start timestamptz,
  session_end timestamptz
)
returns table(session_id uuid, check_in_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_session uuid;
  new_code text;
begin
  if auth.uid() is null or not public.owns_group(target_group) then
    raise exception 'You do not manage this team';
  end if;
  if char_length(trim(session_title)) not between 1 and 160
     or char_length(trim(session_kind)) not between 1 and 60
     or session_end <= session_start then
    raise exception 'Enter a session name, type, and valid session times';
  end if;

  insert into public.sessions(group_id, title, type, starts_at, ends_at)
  values (target_group, trim(session_title), trim(session_kind), session_start, session_end)
  returning id into new_session;

  new_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  insert into public.session_codes(session_id, code_hash, expires_at)
  values (
    new_session,
    encode(extensions.digest(new_code, 'sha256'), 'hex'),
    session_end + interval '2 hours'
  );

  return query select new_session, new_code;
end;
$$;

revoke all on function public.create_session_with_code(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_session_with_code(uuid, text, text, timestamptz, timestamptz) to authenticated;
