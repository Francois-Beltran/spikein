drop policy "students read memberships in joined teams" on public.group_members;
create policy "students read memberships in joined teams" on public.group_members
for select to authenticated
using (public.is_group_member(group_id));

drop policy "students read profiles of teammates" on public.profiles;
create policy "students read profiles of teammates" on public.profiles
for select to authenticated
using (exists(
  select 1 from public.group_members teammate
  where teammate.student_id=profiles.id
    and public.is_group_member(teammate.group_id)
));
