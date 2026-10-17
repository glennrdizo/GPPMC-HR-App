-- Invitations carry their tick boxes (Glenn 2026-10-17): an Owner or HR Admin can tick an invited person's pages and
-- "can change records" before they sign in. Taking up the invitation may now copy the invitation's own pages (views)
-- onto the person's user entry; anything else than exactly the invitation's pages, modules and "can change records" is
-- still refused. Same function as 20261015_hr_security_hardening.sql with only that check changed.
-- Create-only statement (no DROP), so it can run through the Supabase connector.

create or replace function public.hr_docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; o text; n text; was boolean; me text := auth.uid()::text; em text; inv jsonb; cs jsonb; ns jsonb;
  top text[] := array['owner', 'exec', 'admin'];
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
    -- Role keys and role values are plain words (they end up inside the page).
    if exists (select 1 from jsonb_object_keys(coalesce(new.data -> 'roles', '{}'::jsonb)) r where r !~ '^[a-z][a-z0-9_]{0,40}$')
       or exists (select 1 from jsonb_each(coalesce(new.data -> 'users', '{}'::jsonb)) u where (u.value ->> 'role') !~ '^[a-z][a-z0-9_]{0,40}$')
       or exists (select 1 from jsonb_each(coalesce(new.data -> 'invites', '{}'::jsonb)) i where (i.value ->> 'role') !~ '^[a-z][a-z0-9_]{0,40}$')
       or coalesce(new.data ->> 'defaultRole', 'viewer') !~ '^[a-z][a-z0-9_]{0,40}$' then
      raise exception 'Bad role name' using errcode = '22023';
    end if;
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
    -- Owners alone manage HR Admins, the default role and the top role templates and invitations.
    if not public.hr_can_grant() then
      if (cur ->> 'defaultRole') is distinct from (new.data ->> 'defaultRole') then
        raise exception 'Only an Owner can change the default role' using errcode = '42501';
      end if;
      if exists (select 1 from unnest(top) t where (cur -> 'roles' -> t) is distinct from (new.data -> 'roles' -> t)) then
        raise exception 'Only an Owner can change the Owner, Executive and HR Admin roles' using errcode = '42501';
      end if;
      for k in select jsonb_object_keys(coalesce(cur -> 'users', '{}'::jsonb)) union select jsonb_object_keys(coalesce(new.data -> 'users', '{}'::jsonb)) loop
        o := cur -> 'users' -> k ->> 'role'; n := new.data -> 'users' -> k ->> 'role';
        if o is distinct from n and (o = 'admin' or n = 'admin') and not (k = me and o is null and n = 'admin'
             and exists (select 1 from jsonb_each(coalesce(cur -> 'invites', '{}'::jsonb)) e, auth.users u
                         where u.id = auth.uid() and lower(e.value ->> 'email') = lower(u.email) and e.value ->> 'role' = 'admin')) then
          raise exception 'Only an Owner can add or remove HR Admins' using errcode = '42501';
        end if;
      end loop;
      for k in select jsonb_object_keys(coalesce(cur -> 'invites', '{}'::jsonb)) union select jsonb_object_keys(coalesce(new.data -> 'invites', '{}'::jsonb)) loop
        if (cur -> 'invites' -> k) is distinct from (new.data -> 'invites' -> k)
           and ((cur -> 'invites' -> k ->> 'role') = any(top) or (new.data -> 'invites' -> k ->> 'role') = any(top))
           and not ((new.data -> 'invites' -> k) is null and exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = lower(cur -> 'invites' -> k ->> 'email'))) then
          raise exception 'Only an Owner can invite HR Admins, Executives and Owners' using errcode = '42501';
        end if;
      end loop;
    end if;
    if not public.hr_is_admin() then
      cs := coalesce(cur -> 'users' -> me, '{}'::jsonb); ns := coalesce(new.data -> 'users' -> me, '{}'::jsonb);
      if ns - 'lang' - 'name' - 'email' - 'empId' is distinct from cs - 'lang' - 'name' - 'email' - 'empId' then
        select lower(email) into em from auth.users where id = auth.uid();
        select e.value into inv from jsonb_each(coalesce(cur -> 'invites', '{}'::jsonb)) e where em is not null and lower(e.value ->> 'email') = em limit 1;
        if (cs ->> 'role') is not null or inv is null or (ns ->> 'role') is distinct from (inv ->> 'role')
           or (ns - 'lang' - 'name' - 'email' - 'empId' - 'role' - 'views' - 'mods' - 'edit') is distinct from (cs - 'lang' - 'name' - 'email' - 'empId' - 'role' - 'views' - 'mods' - 'edit')
           or coalesce(ns -> 'views', '[]'::jsonb) is distinct from coalesce(inv -> 'views', '[]'::jsonb)
           or coalesce(ns -> 'mods', '[]'::jsonb) is distinct from coalesce(inv -> 'mods', '[]'::jsonb)
           or ((ns ->> 'edit') is not null and (ns ->> 'edit') is distinct from coalesce(inv ->> 'edit', 'true')) then
          raise exception 'Only an HR Admin can change roles' using errcode = '42501';
        end if;
      end if;
      if (coalesce(new.data -> 'users', '{}'::jsonb) - me) is distinct from (coalesce(cur -> 'users', '{}'::jsonb) - me)
         or (new.data - 'users' - 'seen' - 'seenAt' - 'invites') is distinct from (coalesce(cur, '{}'::jsonb) - 'users' - 'seen' - 'seenAt' - 'invites')
         or exists (select 1 from jsonb_each(coalesce(new.data -> 'invites', '{}'::jsonb)) e where (cur -> 'invites' -> e.key) is distinct from e.value)
         or exists (select 1 from jsonb_each(coalesce(cur -> 'invites', '{}'::jsonb)) e
                    where (new.data -> 'invites' -> e.key) is null and lower(e.value ->> 'email') is distinct from em
                      and lower(e.value ->> 'email') is distinct from (select lower(email) from auth.users where id = auth.uid())) then
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
