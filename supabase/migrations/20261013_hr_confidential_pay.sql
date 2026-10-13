-- Confidential payroll (Glenn 2026-10-13): pay of employees marked Confidential is kept under conf/ and only Owners, Executives
-- and the HR staff they choose can read or write it. Everyone else gets nothing back for conf/ paths.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

-- Owners and Executives: the database owner, or a user whose role in org/access is owner or exec.
create or replace function public.hr_can_designate() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and (public.hr_is_owner() or exists (
    select 1 from public.hr_docs where path = 'org/access' and data -> 'users' -> (auth.uid()::text) ->> 'role' in ('owner', 'exec')))
$$;

-- Who may read and write conf/: Owners, Executives, and HR staff they chose (org/access users[id].conf = true).
create or replace function public.hr_can_conf() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_can_designate() or (public.hr_is_editor() and exists (
    select 1 from public.hr_docs where path = 'org/access' and (data -> 'users' -> (auth.uid()::text) ->> 'conf') = 'true'))
$$;

-- Only Owners may hand out or take away the Owner and Executive roles.
create or replace function public.hr_can_grant() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and (public.hr_is_owner() or exists (
    select 1 from public.hr_docs where path = 'org/access' and data -> 'users' -> (auth.uid()::text) ->> 'role' = 'owner'))
$$;

alter policy hr_docs_read on public.hr_docs
  using ((public.hr_is_editor() or (public.hr_is_approved() and (public.hr_is_self(path) or path like 'pub/%'))) and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_insert on public.hr_docs
  with check ((public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path))) and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_update on public.hr_docs
  using ((public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path))) and (path not like 'conf/%' or public.hr_can_conf()))
  with check ((public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path))) and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_delete on public.hr_docs
  using ((public.hr_is_editor() or (public.hr_is_approved() and public.hr_is_self(path))) and (path not like 'conf/%' or public.hr_can_conf()));

-- Guards on writes by signed-in people (the SQL editor and service jobs have no auth.uid() and are not checked):
-- * org/access: only Owners change who is an Owner or Executive; only Owners and Executives choose who else handles confidential pay.
-- * employees/: only people with confidential pay access set or clear the Confidential flag, and pay amounts never land on a confidential employee's open record.
create or replace function public.hr_docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; o text; n text; was boolean;
begin
  if auth.uid() is null then return new; end if;
  select data into cur from public.hr_docs where path = new.path;
  if new.path = 'org/access' and not (public.hr_can_grant() and public.hr_can_designate()) then
    for k in select jsonb_object_keys(coalesce(cur -> 'users', '{}'::jsonb)) union select jsonb_object_keys(coalesce(new.data -> 'users', '{}'::jsonb)) loop
      o := cur -> 'users' -> k ->> 'role'; n := new.data -> 'users' -> k ->> 'role';
      if o is distinct from n and (o in ('owner', 'exec') or n in ('owner', 'exec')) then
        raise exception 'Only an Owner can change Owners and Executives' using errcode = '42501';
      end if;
      if (cur -> 'users' -> k ->> 'conf') is distinct from (new.data -> 'users' -> k ->> 'conf') and not public.hr_can_designate() then
        raise exception 'Only an Owner or Executive can choose who handles confidential pay' using errcode = '42501';
      end if;
    end loop;
  end if;
  if new.path like 'employees/%' and not public.hr_can_conf() then
    was := coalesce((cur ->> 'conf') = 'true', false);
    if was then new.data := (new.data - 'basicPay' - 'allow' - 'hdmfVol' - 'prev' - 'bank' - 'bankAcct') || '{"conf": true}'::jsonb;
    elsif (new.data ->> 'conf') = 'true' then new.data := new.data - 'conf';
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_guard before insert or update on public.hr_docs for each row execute function public.hr_docs_guard();
  end if;
end $$;

revoke execute on function public.hr_can_conf(), public.hr_can_grant(), public.hr_can_designate() from anon, public;
grant execute on function public.hr_can_conf(), public.hr_can_grant(), public.hr_can_designate() to authenticated;
