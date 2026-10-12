-- New accounts must be approved by HR before they see anything (Glenn 2026-10-12).
-- Create-only statements (no DROP), so it can run through the Supabase connector.
create table if not exists public.hr_signups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  name text,
  email text,
  emp_no text,
  position text,
  mobile text,
  note text,
  hr_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
alter table public.hr_signups enable row level security;
revoke all on public.hr_signups from anon;
grant select on public.hr_signups to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_signups' and policyname = 'hr_signups_read') then
    create policy hr_signups_read on public.hr_signups for select to authenticated using (user_id = auth.uid() or public.hr_is_editor());
  end if;
end $$;

-- Everyone who already has an account keeps access.
insert into public.hr_signups (user_id, status, name, email, decided_at)
  select p.user_id, 'approved', p.name, p.email, now() from public.hr_profiles p
  on conflict (user_id) do nothing;

create or replace function public.hr_is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() or exists (select 1 from public.hr_signups where user_id = auth.uid() and status = 'approved')
$$;

-- Employees' own time clock and the shared pub/ pages now need an approved account.
alter policy hr_docs_read on public.hr_docs using (public.hr_is_editor() or (public.hr_is_approved() and (public.hr_is_self(path) or path like 'pub/%')));
alter policy hr_docs_insert on public.hr_docs with check (public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path)));
alter policy hr_docs_update on public.hr_docs using (public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path)))
  with check (public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path)));
alter policy hr_docs_delete on public.hr_docs using (public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path)));
alter policy hr_files_insert on storage.objects with check (bucket_id = 'hr-files' and public.hr_is_approved());

-- The person asks for access with details HR can check against the employee records.
create or replace function public.hr_request_access(p_name text, p_emp_no text default null, p_position text default null, p_mobile text default null, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; st text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select lower(email) into em from auth.users where id = uid;
  select status into st from public.hr_signups where user_id = uid;
  if st = 'approved' then return st; end if;
  insert into public.hr_signups (user_id, status, name, email, emp_no, position, mobile, note, requested_at)
    values (uid, 'pending', left(trim(p_name), 120), em, left(trim(p_emp_no), 40), left(trim(p_position), 120), left(trim(p_mobile), 40), left(trim(p_note), 500), now())
    on conflict (user_id) do update set status = 'pending', name = excluded.name, email = excluded.email, emp_no = excluded.emp_no, position = excluded.position,
      mobile = excluded.mobile, note = excluded.note, hr_note = null, requested_at = now(), decided_at = null, decided_by = null;
  return 'pending';
end $$;

-- HR approves or rejects.
create or replace function public.hr_decide_access(target uuid, approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_editor() then raise exception 'not_granted'; end if;
  insert into public.hr_signups (user_id, status, email, hr_note, decided_at, decided_by)
    select u.id, case when approve then 'approved' else 'rejected' end, lower(u.email), left(trim(p_note), 500), now(), auth.uid() from auth.users u where u.id = target
    on conflict (user_id) do update set status = excluded.status, hr_note = excluded.hr_note, decided_at = now(), decided_by = auth.uid();
end $$;

create or replace function public.hr_signup_list() returns setof public.hr_signups
language sql stable security definer set search_path = public as $$
  select * from public.hr_signups where public.hr_is_editor() order by (status = 'pending') desc, requested_at desc limit 500
$$;

-- Sign-in also reports the account's approval status. Editors (owner, invited HR staff) are always approved.
create or replace function public.hr_claim(display_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; inv jsonb; is_ed boolean; is_own boolean; invited boolean := false; st text; hn text;
begin
  if uid is null then return jsonb_build_object('editor', false); end if;
  select lower(email), email_confirmed_at into em, ok from auth.users where id = uid;
  insert into public.hr_profiles (user_id, name, email) values (uid, nullif(trim(display_name), ''), em)
    on conflict (user_id) do update set name = coalesce(excluded.name, public.hr_profiles.name), email = excluded.email, updated_at = now();
  if ok is not null and not exists (select 1 from public.hr_editors where user_id = uid) then
    if exists (select 1 from public.hr_owner_emails where lower(email) = em) then
      insert into public.hr_editors (user_id, email, is_owner) values (uid, em, true);
    else
      select data -> 'invites' into inv from public.hr_docs where path = 'org/access';
      invited := inv is not null and exists (select 1 from jsonb_each(inv) e where lower(e.value ->> 'email') = em);
      if invited then insert into public.hr_editors (user_id, email) values (uid, em); end if;
    end if;
  end if;
  select not revoked, is_owner into is_ed, is_own from public.hr_editors where user_id = uid;
  select status, hr_note into st, hn from public.hr_signups where user_id = uid;
  if coalesce(is_ed, false) then st := 'approved'; end if;
  return jsonb_build_object('editor', coalesce(is_ed, false), 'owner', coalesce(is_own, false), 'email', em, 'access', coalesce(st, 'none'), 'hr_note', hn);
end $$;

revoke execute on function public.hr_is_approved(), public.hr_request_access(text, text, text, text, text), public.hr_decide_access(uuid, boolean, text), public.hr_signup_list() from anon, public;
grant execute on function public.hr_is_approved(), public.hr_request_access(text, text, text, text, text), public.hr_decide_access(uuid, boolean, text), public.hr_signup_list() to authenticated;
