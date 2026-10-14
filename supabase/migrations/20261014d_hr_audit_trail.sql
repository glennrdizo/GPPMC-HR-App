-- Audit Trail (Glenn, 2026-10-14).
-- * hr_audit_log: the database writes one row for every save to hr_docs (who, when, add/change/delete, which record and
--   which fields, never the values). Nobody can change or delete it through the API: no policies, read only through
--   hr_audit_list(), which Owners, HR Admins, Executives and people given the Audit Trail pages may call.
-- * The app's own audit log docs (audit/...) hold the before and after of each change. Only those same people read them
--   (everyone can read their own). Each doc is stamped with its writer, can only grow, and can't be deleted.
--   View-only people may write their own (so their sign-ins and downloads are recorded too).
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create table if not exists public.hr_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  uid uuid,
  op text not null,
  path text not null,
  keys text[] not null default '{}'
);
create index if not exists hr_audit_log_at_idx on public.hr_audit_log (at desc);
alter table public.hr_audit_log enable row level security;
revoke all on public.hr_audit_log from anon, authenticated;

create or replace function public.hr_can_audit() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and (public.hr_is_admin() or exists (
    select 1 from public.hr_docs a where a.path = 'org/access' and (
      (public.hr_role() = 'custom' and coalesce(a.data -> 'users' -> (auth.uid()::text) -> 'views', '[]'::jsonb) ? 'audtrail')
      or coalesce(a.data -> 'roles' -> public.hr_role() -> 'views', '[]'::jsonb) ? 'audtrail')))
$$;
revoke execute on function public.hr_can_audit() from anon, public;
grant execute on function public.hr_can_audit() to authenticated;

-- Server record: written after every save. Skips the logs themselves and "last seen" stamps.
create or replace function public.hr_audit_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text := coalesce(new.path, old.path); ks text[] := '{}';
begin
  if p like 'audit/%' or p like 'activity/%' or p like 'pub/%' then return null; end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into ks from (
      select key as k from jsonb_each(old.data) union select key from jsonb_each(new.data)) s
      where (old.data -> k) is distinct from (new.data -> k);
    if p = 'org/access' then ks := array(select unnest(ks) except select unnest(array['seen', 'seenAt'])); end if;
    if cardinality(ks) = 0 then return null; end if;
  end if;
  insert into public.hr_audit_log (uid, op, path, keys) values (auth.uid(), tg_op, p, ks);
  return null;
end $$;
revoke execute on function public.hr_audit_write() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_audit_write' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_audit_write after insert or update or delete on public.hr_docs for each row execute function public.hr_audit_write();
  end if;
end $$;

create or replace function public.hr_audit_list(p_from date, p_to date)
returns table (at timestamptz, uid uuid, name text, op text, path text, keys text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_can_audit() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query
    select l.at, l.uid, coalesce(nullif(pr.name, ''), pr.email), l.op, l.path, l.keys
    from public.hr_audit_log l left join public.hr_profiles pr on pr.user_id = l.uid
    where (l.at at time zone 'Asia/Manila')::date between p_from and p_to
    order by l.at desc limit 5000;
end $$;
revoke execute on function public.hr_audit_list(date, date) from anon, public;
grant execute on function public.hr_audit_list(date, date) to authenticated;

-- The app's audit docs: stamped with the writer, append-only, never deleted.
create or replace function public.hr_audit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(new.path, old.path) not like 'audit/%' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then raise exception 'The audit log can''t be deleted' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and ((old.data ->> 'uid') is distinct from auth.uid()::text
      or not (coalesce(new.data -> 'items', '[]'::jsonb) @> coalesce(old.data -> 'items', '[]'::jsonb))) then
    raise exception 'The audit log can only be added to' using errcode = '42501';
  end if;
  new.data := jsonb_set(new.data, '{uid}', to_jsonb(auth.uid()::text));
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_audit_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_audit_guard before insert or update or delete on public.hr_docs for each row execute function public.hr_audit_guard();
  end if;
end $$;

alter policy hr_docs_read on public.hr_docs
  using ((public.hr_is_editor() or (public.hr_is_approved() and (public.hr_is_self(path) or path like 'pub/%')))
    and (path not like 'conf/%' or public.hr_can_conf())
    and (col <> 'hrdreg' or coalesce(data ->> 'reg', '') !~ '^hrdr?_(16|17|30|37)(_|$)' or public.hr_can_er())
    and (col <> 'audit' or public.hr_can_audit() or (data ->> 'uid') = auth.uid()::text));
alter policy hr_docs_insert on public.hr_docs
  with check ((public.hr_can_write() or (public.hr_is_editor() and (path = 'org/access' or path like 'audit/%')) or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()));
alter policy hr_docs_update on public.hr_docs
  using ((public.hr_can_write() or (public.hr_is_editor() and (path = 'org/access' or path like 'audit/%')) or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()))
  with check ((public.hr_can_write() or (public.hr_is_editor() and (path = 'org/access' or path like 'audit/%')) or (public.hr_is_approved() and public.hr_is_self(path)))
    and (path not like 'conf/%' or public.hr_can_conf()));
