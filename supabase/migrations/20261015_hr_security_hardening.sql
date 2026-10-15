-- Security audit #4 (2026-10-15). Closes the role, invite and file-storage gaps found after audit #3.
-- * hr_role(): someone who isn't in the Users list gets the role of the invitation sent to their email, otherwise the
--   default role, but never Owner, Executive or HR Admin through the default (they get View only instead).
-- * org/access: only an Owner adds or removes HR Admins, changes the default role, or edits the Owner, Executive and
--   HR Admin role templates and invitations. Taking up an invitation can't add modules or "can change records".
--   Only HR Admins remove invitations (a person may remove the one sent to their own email). Role keys must be plain words.
-- * Record ids: no quotes, angle brackets, ampersands, backslashes, backticks or control characters in any path.
-- * Sign-up requests (mobile, employee no., HR notes) are readable by HR Admins, Owners and Executives only.
-- * Files: only roles that may change records delete files or upload into folders; employees upload only to the top level.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create or replace function public.hr_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.hr_is_owner() then 'owner' else coalesce(
    (select coalesce(
       a.data -> 'users' -> (auth.uid()::text) ->> 'role',
       (select e.value ->> 'role' from jsonb_each(coalesce(a.data -> 'invites', '{}'::jsonb)) e, auth.users u
         where u.id = auth.uid() and u.email is not null and lower(e.value ->> 'email') = lower(u.email) and (e.value ->> 'role') not in ('owner', 'exec') limit 1),
       case when (a.data ->> 'defaultRole') in ('owner', 'exec', 'admin') then 'viewer' else a.data ->> 'defaultRole' end)
     from public.hr_docs a where a.path = 'org/access'),
    'viewer') end
$$;

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
           or coalesce(jsonb_array_length(ns -> 'views'), 0) > 0
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

-- Record ids end up inside the page, so no characters that could break out of it.
create or replace function public.hr_docs_id_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.path like 'hrdreg/%' and split_part(new.path, '/', 2) !~ '^[A-Za-z0-9_-]{1,60}$' then
    raise exception 'Bad record id' using errcode = '22023';
  end if;
  if new.path ~ '[<>"''`&\\[:cntrl:]]' or length(new.path) > 300 then
    raise exception 'Bad record id' using errcode = '22023';
  end if;
  return new;
end $$;

-- Sign-up requests: HR Admins, Owners and Executives.
alter policy hr_signups_read on public.hr_signups using (user_id = auth.uid() or public.hr_is_admin());
create or replace function public.hr_signup_list() returns setof public.hr_signups
language sql stable security definer set search_path = public as $$
  select * from public.hr_signups where public.hr_is_admin() order by (status = 'pending') desc, requested_at desc limit 500
$$;

-- Files: deleting needs a role that may change records (or your own upload); employees upload only at the top level.
alter policy hr_files_delete on storage.objects using (bucket_id = 'hr-files' and (public.hr_can_write() or owner = auth.uid()));
alter policy hr_files_insert on storage.objects with check (bucket_id = 'hr-files' and (public.hr_can_write() or (public.hr_is_approved() and name !~ '/')));

-- Trigger and helper functions are never called through the API.
revoke execute on function public.hr_docs_guard(), public.hr_docs_id_guard(), public.hr_audit_guard() from anon, public;
revoke execute on function public.hr_signup_list() from anon, public;
grant execute on function public.hr_signup_list() to authenticated;
