-- Team contribution ledger. Amounts are stored as integer centavos.
create sequence public.contribution_receipt_numbers;

create table public.contribution_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  target_centavos bigint not null default 0 check (target_centavos >= 0),
  treasurer_id uuid references public.profiles(id) on delete set null,
  auditor_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (treasurer_id is null or auditor_id is null or treasurer_id <> auditor_id)
);

create table public.contribution_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  payer_id uuid not null references public.profiles(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  paid_on date not null,
  status text not null default 'pending' check (status in ('pending','approved')),
  entered_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  receipt_number bigint unique,
  created_at timestamptz not null default now(),
  check ((status = 'approved') = (receipt_number is not null and approved_by is not null and approved_at is not null))
);
create index contribution_payments_group_idx on public.contribution_payments(group_id, created_at desc);
create index contribution_payments_payer_idx on public.contribution_payments(payer_id, group_id);

create table public.contribution_payment_edits (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.contribution_payments(id) on delete cascade,
  old_amount_centavos bigint not null,
  new_amount_centavos bigint not null,
  old_paid_on date not null,
  new_paid_on date not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  edited_by uuid not null references public.profiles(id),
  edited_at timestamptz not null default now()
);

create function public.is_contribution_staff(target_group uuid, target_duty text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contribution_settings s
    join public.group_members m on m.group_id=s.group_id and m.student_id=(select auth.uid())
    where s.group_id=target_group and (
      (target_duty is null and (s.treasurer_id=(select auth.uid()) or s.auditor_id=(select auth.uid())))
      or (target_duty='treasurer' and s.treasurer_id=(select auth.uid()))
      or (target_duty='auditor' and s.auditor_id=(select auth.uid()))
    )
  )
$$;

create function public.clear_removed_contribution_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.contribution_settings
  set treasurer_id=case when treasurer_id=old.student_id then null else treasurer_id end,
      auditor_id=case when auditor_id=old.student_id then null else auditor_id end,
      updated_at=now()
  where group_id=old.group_id and (treasurer_id=old.student_id or auditor_id=old.student_id);
  return old;
end $$;
create trigger clear_removed_contribution_staff after delete on public.group_members
for each row execute function public.clear_removed_contribution_staff();

create function public.set_contribution_settings(target_group uuid, new_target_centavos bigint, new_treasurer uuid, new_auditor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_group(target_group) then raise exception 'Only the team coach can manage contribution settings'; end if;
  if new_target_centavos is null or new_target_centavos < 0 then raise exception 'Target must be zero or greater'; end if;
  if new_treasurer is not null and not exists (select 1 from public.group_members where group_id=target_group and student_id=new_treasurer) then raise exception 'Treasurer must be on the roster'; end if;
  if new_auditor is not null and not exists (select 1 from public.group_members where group_id=target_group and student_id=new_auditor) then raise exception 'Auditor must be on the roster'; end if;
  if new_treasurer is not null and new_treasurer=new_auditor then raise exception 'Choose different people for treasurer and auditor'; end if;
  insert into public.contribution_settings(group_id,target_centavos,treasurer_id,auditor_id)
  values(target_group,new_target_centavos,new_treasurer,new_auditor)
  on conflict (group_id) do update set target_centavos=excluded.target_centavos,treasurer_id=excluded.treasurer_id,auditor_id=excluded.auditor_id,updated_at=now();
end $$;

create function public.record_contribution(target_group uuid, target_payer uuid, amount_centavos bigint, payment_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; is_treasurer boolean;
begin
  is_treasurer := public.is_contribution_staff(target_group,'treasurer');
  if not is_treasurer and not public.is_contribution_staff(target_group,'auditor') then raise exception 'Only team finance staff can record payments'; end if;
  if amount_centavos is null or amount_centavos <= 0 or payment_date is null or payment_date > current_date then raise exception 'Enter a valid amount and paid date'; end if;
  if not exists (select 1 from public.groups where id=target_group and owner_id=target_payer)
     and not exists (select 1 from public.group_members where group_id=target_group and student_id=target_payer) then
    raise exception 'Payer is not on this team';
  end if;
  insert into public.contribution_payments(group_id,payer_id,amount_centavos,paid_on,entered_by,status,approved_by,approved_at,receipt_number)
  values(target_group,target_payer,amount_centavos,payment_date,(select auth.uid()),case when is_treasurer then 'approved' else 'pending' end,
    case when is_treasurer then (select auth.uid()) end,case when is_treasurer then now() end,
    case when is_treasurer then nextval('public.contribution_receipt_numbers') end)
  returning id into new_id;
  return new_id;
end $$;

create function public.approve_contribution(target_payment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_group uuid;
begin
  select group_id into target_group from public.contribution_payments where id=target_payment for update;
  if target_group is null or not public.is_contribution_staff(target_group,'treasurer') then raise exception 'Only the team treasurer can approve payments'; end if;
  update public.contribution_payments set status='approved',approved_by=(select auth.uid()),approved_at=now(),receipt_number=nextval('public.contribution_receipt_numbers')
  where id=target_payment and status='pending';
  if not found then raise exception 'Payment has already been approved'; end if;
end $$;

create function public.correct_contribution(target_payment uuid, new_amount_centavos bigint, new_paid_on date, correction_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare prior public.contribution_payments%rowtype;
begin
  select * into prior from public.contribution_payments where id=target_payment for update;
  if prior.id is null or prior.status<>'approved' or not public.is_contribution_staff(prior.group_id,'treasurer') then raise exception 'Only the team treasurer can correct approved payments'; end if;
  if new_amount_centavos is null or new_amount_centavos<=0 or new_paid_on is null or new_paid_on>current_date then raise exception 'Enter a valid amount and paid date'; end if;
  if char_length(trim(coalesce(correction_reason,''))) not between 3 and 500 then raise exception 'Enter a correction reason'; end if;
  if prior.amount_centavos=new_amount_centavos and prior.paid_on=new_paid_on then raise exception 'No payment details changed'; end if;
  insert into public.contribution_payment_edits(payment_id,old_amount_centavos,new_amount_centavos,old_paid_on,new_paid_on,reason,edited_by)
  values(target_payment,prior.amount_centavos,new_amount_centavos,prior.paid_on,new_paid_on,trim(correction_reason),(select auth.uid()));
  update public.contribution_payments set amount_centavos=new_amount_centavos,paid_on=new_paid_on where id=target_payment;
end $$;

alter table public.contribution_settings enable row level security;
alter table public.contribution_payments enable row level security;
alter table public.contribution_payment_edits enable row level security;
create policy "team sees contribution target" on public.contribution_settings for select to authenticated using (public.owns_group(group_id) or public.is_group_member(group_id));
create policy "payer and staff see payments" on public.contribution_payments for select to authenticated using (payer_id=(select auth.uid()) or public.owns_group(group_id) or public.is_contribution_staff(group_id));
create policy "payer and staff see corrections" on public.contribution_payment_edits for select to authenticated using (exists (select 1 from public.contribution_payments p where p.id=payment_id and (p.payer_id=(select auth.uid()) or public.owns_group(p.group_id) or public.is_contribution_staff(p.group_id))));
create policy "finance staff see team profiles" on public.profiles for select to authenticated using (
  exists (select 1 from public.group_members m where m.student_id=profiles.id and public.is_contribution_staff(m.group_id))
  or exists (select 1 from public.groups g where g.owner_id=profiles.id and public.is_contribution_staff(g.id))
);
create policy "members see their coach profile for receipts" on public.profiles for select to authenticated using (
  exists (select 1 from public.groups g where g.owner_id=profiles.id and public.is_group_member(g.id))
);
create policy "finance staff see team memberships" on public.group_members for select to authenticated using (public.is_contribution_staff(group_id));
create policy "finance staff see team" on public.groups for select to authenticated using (public.is_contribution_staff(id));

revoke all on sequence public.contribution_receipt_numbers from public, anon, authenticated;
revoke all on public.contribution_settings,public.contribution_payments,public.contribution_payment_edits from public,anon;
grant select on public.contribution_settings,public.contribution_payments,public.contribution_payment_edits to authenticated;
revoke all on function public.is_contribution_staff(uuid,text),public.set_contribution_settings(uuid,bigint,uuid,uuid),public.record_contribution(uuid,uuid,bigint,date),public.approve_contribution(uuid),public.correct_contribution(uuid,bigint,date,text) from public,anon;
revoke all on function public.clear_removed_contribution_staff() from public,anon,authenticated;
grant execute on function public.is_contribution_staff(uuid,text),public.set_contribution_settings(uuid,bigint,uuid,uuid),public.record_contribution(uuid,uuid,bigint,date),public.approve_contribution(uuid),public.correct_contribution(uuid,bigint,date,text) to authenticated;
