-- Editors can be switched off without deleting rows; HR can grant or revoke from the Users list.
alter table public.hr_editors add column if not exists revoked boolean not null default false;
create or replace function public.hr_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hr_editors where user_id = auth.uid() and not revoked)
$$;
create or replace function public.hr_claim(display_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; inv jsonb; is_ed boolean; is_own boolean; invited boolean := false;
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
  return jsonb_build_object('editor', coalesce(is_ed, false), 'owner', coalesce(is_own, false), 'email', em);
end $$;
create or replace function public.hr_set_editor(target uuid, allow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_editor() then raise exception 'not_granted'; end if;
  if allow then
    insert into public.hr_editors (user_id, email) select p.user_id, p.email from public.hr_profiles p where p.user_id = target
      on conflict (user_id) do update set revoked = false;
  else
    update public.hr_editors set revoked = true where user_id = target and not is_owner;
  end if;
end $$;
drop function if exists public.hr_people(text);
create or replace function public.hr_people(q text default '') returns table (user_id uuid, name text, email text, editor boolean)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.email, coalesce(not e.revoked, false) from public.hr_profiles p left join public.hr_editors e on e.user_id = p.user_id
  where public.hr_is_editor() and (coalesce(q, '') = '' or p.name ilike '%' || q || '%' or p.email ilike '%' || q || '%')
  order by p.name limit 50
$$;
revoke execute on function public.hr_claim(text), public.hr_set_editor(uuid, boolean), public.hr_people(text), public.hr_is_editor(), public.hr_is_owner(), public.hr_is_self(text) from anon, public;
grant execute on function public.hr_claim(text), public.hr_set_editor(uuid, boolean), public.hr_people(text), public.hr_is_editor(), public.hr_is_owner(), public.hr_is_self(text) to authenticated;
