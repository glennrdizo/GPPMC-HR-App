-- Security audit 2026-10-14 (F3, F4): roles become real database limits, and the Confidential flag can't be dropped by
-- deleting and re-creating an employee.
-- * Writing records needs a role that may change records (not View only, not a Custom role with "can change" off).
--   View-only people may still update org/access, but only their own "last seen", language and name.
-- * Only HR Admins, Owners and Executives change roles, invitations and who may sign in (hr_set_editor, hr_decide_access).
-- * employees/: the guard compares with the stored row (OLD), refuses moving a record to another path, refuses deleting a
--   confidential employee without confidential access, and keeps the flag when a deleted record is re-created.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

-- The signed-in person's role in the Users list (the page owner is always owner; unset falls back to the default role).
create or replace function public.hr_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.hr_is_owner() then 'owner' else coalesce(
    (select coalesce(data -> 'users' -> (auth.uid()::text) ->> 'role', data ->> 'defaultRole') from public.hr_docs where path = 'org/access'),
    'admin') end
$$;

-- HR Admins, Owners and Executives manage users and roles.
create or replace function public.hr_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and public.hr_role() in ('owner', 'admin', 'exec')
$$;

-- May change records: any role except View only and No access, and except Custom or saved roles with "can change records" off.
create or replace function public.hr_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and (public.hr_is_admin() or (
    public.hr_role() not in ('viewer', 'none') and not exists (
      select 1 from public.hr_docs a where a.path = 'org/access' and (
        (public.hr_role() = 'custom' and (a.data -> 'users' -> (auth.uid()::text) ->> 'edit') = 'false')
        or (a.data -> 'roles' -> public.hr_role() ->> 'edit') = 'false'))))
$$;

revoke execute on function public.hr_role(), public.hr_is_admin(), public.hr_can_write() from anon, public;
grant execute on function public.hr_role(), public.hr_is_admin(), public.hr_can_write() to authenticated;

alter policy hr_docs_insert on public.hr_docs
  with check ((public.hr_can_write() or (public.hr_is_editor() and path = 'org/access') or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_update on public.hr_docs
  using ((public.hr_can_write() or (public.hr_is_editor() and path = 'org/access') or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()))
  with check ((public.hr_can_write() or (public.hr_is_editor() and path = 'org/access') or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_delete on public.hr_docs
  using ((public.hr_can_write() or (public.hr_is_approved() and public.hr_is_self(path))) and (path not like 'conf/%' or public.hr_can_conf()));

create or replace function public.hr_set_editor(target uuid, allow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted'; end if;
  if allow then
    insert into public.hr_editors (user_id, email) select p.user_id, p.email from public.hr_profiles p where p.user_id = target
      on conflict (user_id) do update set revoked = false;
  else
    update public.hr_editors set revoked = true where user_id = target and not is_owner;
  end if;
end $$;

create or replace function public.hr_decide_access(target uuid, approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted'; end if;
  insert into public.hr_signups (user_id, status, email, hr_note, decided_at, decided_by)
    select u.id, case when approve then 'approved' else 'rejected' end, lower(u.email), left(trim(p_note), 500), now(), auth.uid() from auth.users u where u.id = target
    on conflict (user_id) do update set status = excluded.status, hr_note = excluded.hr_note, decided_at = now(), decided_by = auth.uid();
end $$;

create or replace function public.hr_docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; o text; n text; was boolean; me text := auth.uid()::text; em text; inv jsonb; cs jsonb; ns jsonb;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.path like 'employees/%' and (old.data ->> 'conf') = 'true' and not public.hr_can_conf() then
      raise exception 'Only people with confidential pay access can delete this employee' using errcode = '42501';
    end if;
    if old.path = 'org/access' and not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.path is distinct from old.path then raise exception 'Records can''t be moved' using errcode = '42501'; end if;
    cur := old.data;
  else
    select data into cur from public.hr_docs where path = new.path;
  end if;
  if new.path = 'org/access' then
    if not (public.hr_can_grant() and public.hr_can_designate()) then
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
    -- Everyone else may change only their own "last seen", language and name, and take up an invitation sent to their email.
    if not public.hr_is_admin() then
      cs := coalesce(cur -> 'users' -> me, '{}'::jsonb); ns := coalesce(new.data -> 'users' -> me, '{}'::jsonb);
      if ns - 'lang' - 'name' - 'email' - 'empId' is distinct from cs - 'lang' - 'name' - 'email' - 'empId' then
        select lower(email) into em from auth.users where id = auth.uid();
        select e.value into inv from jsonb_each(coalesce(cur -> 'invites', '{}'::jsonb)) e where em is not null and lower(e.value ->> 'email') = em limit 1;
        if (cs ->> 'role') is not null or inv is null or (ns ->> 'role') is distinct from (inv ->> 'role')
           or (ns - 'lang' - 'name' - 'email' - 'empId' - 'role' - 'views' - 'mods' - 'edit') is distinct from (cs - 'lang' - 'name' - 'email' - 'empId' - 'role' - 'views' - 'mods' - 'edit')
           or coalesce(jsonb_array_length(ns -> 'views'), 0) > 0 then
          raise exception 'Only an HR Admin can change roles' using errcode = '42501';
        end if;
      end if;
      if (coalesce(new.data -> 'users', '{}'::jsonb) - me) is distinct from (coalesce(cur -> 'users', '{}'::jsonb) - me)
         or (new.data - 'users' - 'seen' - 'seenAt' - 'invites') is distinct from (coalesce(cur, '{}'::jsonb) - 'users' - 'seen' - 'seenAt' - 'invites')
         or exists (select 1 from jsonb_each(coalesce(new.data -> 'invites', '{}'::jsonb)) e where (cur -> 'invites' -> e.key) is distinct from e.value) then
        raise exception 'Only an HR Admin can change users and roles' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.path like 'employees/%' and not public.hr_can_conf() then
    was := coalesce((cur ->> 'conf') = 'true', false)
      or exists (select 1 from public.hr_docs where path = 'conf/employees--' || split_part(new.path, '/', 2));
    if was then new.data := (new.data - 'basicPay' - 'allow' - 'hdmfVol' - 'prev' - 'bank' - 'bankAcct') || '{"conf": true}'::jsonb;
    elsif (new.data ->> 'conf') = 'true' then new.data := new.data - 'conf';
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_guard_del' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_guard_del before delete on public.hr_docs for each row execute function public.hr_docs_guard();
  end if;
end $$;
