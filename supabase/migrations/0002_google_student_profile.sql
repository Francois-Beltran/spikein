-- Let authenticated Google users create a player profile after first sign-in.
-- Coach roles are never assigned by this function.
create or replace function public.create_student_profile(profile_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_record auth.users%rowtype;
  created public.profiles;
begin
  if auth.uid() is null or char_length(trim(profile_name)) not between 1 and 120 then
    raise exception 'A signed-in user and valid profile name are required';
  end if;

  select * into current_user_record
  from auth.users
  where id = auth.uid();

  if current_user_record.id is null
    or current_user_record.email_confirmed_at is null
    or not coalesce(current_user_record.raw_app_meta_data -> 'providers' ? 'google', false) then
    raise exception 'A Google sign-in with a verified email is required';
  end if;

  insert into public.profiles (id, full_name, role)
  values (auth.uid(), trim(profile_name), 'student')
  returning * into created;

  return created;
end;
$$;

revoke all on function public.create_student_profile(text) from public, anon;
grant execute on function public.create_student_profile(text) to authenticated;
