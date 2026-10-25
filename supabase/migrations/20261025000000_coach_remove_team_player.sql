create or replace function public.remove_team_member(target_group uuid, target_student uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_coach uuid := auth.uid();
begin
  if current_coach is null then raise exception 'Sign in is required'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = current_coach and p.role = 'coach'
  ) or not public.owns_group(target_group) then
    raise exception 'You do not manage this team';
  end if;
  if not exists (
    select 1
    from public.group_members gm
    join public.profiles p on p.id = gm.student_id and p.role = 'student'
    where gm.group_id = target_group and gm.student_id = target_student
  ) then
    raise exception 'Player is not on this team roster';
  end if;

  delete from public.group_members gm
  where gm.group_id = target_group and gm.student_id = target_student;
end;
$$;

revoke all on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
