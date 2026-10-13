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
    on conflict on constraint group_invitations_group_id_email_key do update set status='pending', invited_by=excluded.invited_by, created_at=now(), expires_at=now()+interval '30 days', accepted_at=null;
  else
    if not exists (select 1 from public.group_members gm where gm.group_id=target_group and gm.student_id=member_user)
       and (select count(*) from public.group_members gm where gm.group_id=target_group) + (select count(*) from public.group_invitations gi where gi.group_id=target_group and gi.status = 'pending' and gi.expires_at > now() and gi.email <> normalized_email) >= 20 then raise exception 'This team has reached its 20 player limit'; end if;
    insert into public.group_members(group_id, student_id) values (target_group, member_user) on conflict do nothing;
    insert into public.group_invitations(group_id, email, status, invited_by, accepted_at) values (target_group, normalized_email, 'accepted', (select auth.uid()), now()) on conflict on constraint group_invitations_group_id_email_key do update set status='accepted', invited_by=excluded.invited_by, accepted_at=now();
  end if;
  return query select gi.id, g.name, gi.email, gi.status, gi.expires_at from public.group_invitations gi join public.groups g on g.id=gi.group_id where gi.group_id=target_group and gi.email=normalized_email;
end; $$;
