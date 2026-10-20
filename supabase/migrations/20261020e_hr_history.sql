-- Record history and newest-first reads (Glenn 2026-10-20: full automation; review 2026-10-17 DB2, DB4).
-- DB2 Every change to a record keeps the version before it for 90 days (hr_doc_history), so one wrong save or delete of an
--     employee, pay run or setting can be undone on its own instead of restoring the whole database. HR Managers, Owners
--     and Executives see the list on Audit Trail on the website and restore a version there. Not kept: punches and phone
--     records (clockins/, already never changed), the activity and audit logs, and sign-in stamps on the access record.
--     Confidential pay (conf/) history is shown only to those who may see it.
-- DB4 hr_query reads newest records first when no order is given, so a list that outgrows its read limit leaves out the
--     oldest records instead of the newest.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create table if not exists public.hr_doc_history (
  id bigserial primary key,
  path text not null,
  col text not null,
  op text not null, -- 'U' changed, 'D' deleted
  data jsonb not null, -- the record as it was before the change
  version integer,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);
create index if not exists hr_doc_history_path on public.hr_doc_history (path, changed_at desc);
create index if not exists hr_doc_history_at on public.hr_doc_history (changed_at desc);
alter table public.hr_doc_history enable row level security;
revoke all on public.hr_doc_history from anon, authenticated;

create or replace function public.hr_docs_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.path like 'clockins/%' or old.col in ('activity', 'audit') then return null; end if;
  if tg_op = 'UPDATE' then
    if new.data = old.data then return null; end if;
    if old.path = 'org/access' and (new.data - 'seen' - 'seenAt') = (old.data - 'seen' - 'seenAt') then return null; end if;
  end if;
  insert into public.hr_doc_history (path, col, op, data, version) values (old.path, old.col, case when tg_op = 'DELETE' then 'D' else 'U' end, old.data, old.version);
  return null;
end $$;
revoke execute on function public.hr_docs_history() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_history' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_history after update or delete on public.hr_docs for each row execute function public.hr_docs_history();
  end if;
end $$;

-- Who may see a version: HR Managers, Owners, Executives; conf/ only with confidential access; pay only with Payroll.
create or replace function public.hr_history_ok(p text, c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_admin() and (p not like 'conf/%' or public.hr_can_conf())
    and (c not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or public.hr_can_pay())
$$;
revoke execute on function public.hr_history_ok(text, text) from anon, public;

create or replace function public.hr_history_list(p_path text default null, p_col text default null, p_lim integer default 200)
returns table (id bigint, path text, col text, op text, version integer, changed_at timestamptz, changed_by text, size integer, gone boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query select h.id, h.path, h.col, h.op, h.version, h.changed_at,
      coalesce((select coalesce(nullif(p.name, ''), p.email) from public.hr_profiles p where p.user_id = h.changed_by), case when h.changed_by is null then 'System' else 'Someone' end),
      octet_length(h.data::text), not exists (select 1 from public.hr_docs d where d.path = h.path)
    from public.hr_doc_history h
    where (p_path is null or h.path = p_path) and (p_col is null or h.col = p_col) and public.hr_history_ok(h.path, h.col)
    order by h.changed_at desc, h.id desc limit greatest(1, least(coalesce(p_lim, 200), 1000));
end $$;
create or replace function public.hr_history_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h public.hr_doc_history;
begin
  select * into h from public.hr_doc_history where id = p_id;
  if h.id is null or not public.hr_history_ok(h.path, h.col) then raise exception 'not_granted' using errcode = '42501'; end if;
  return jsonb_build_object('path', h.path, 'data', h.data, 'now', (select d.data from public.hr_docs d where d.path = h.path));
end $$;
-- Puts a version back. The current version is itself kept in history first, so a restore can be undone the same way.
create or replace function public.hr_history_restore(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare h public.hr_doc_history;
begin
  select * into h from public.hr_doc_history where id = p_id;
  if h.id is null or not public.hr_history_ok(h.path, h.col) or not public.hr_can_write() then raise exception 'not_granted' using errcode = '42501'; end if;
  insert into public.hr_docs (path, col, data) values (h.path, h.col, h.data)
    on conflict (path) do update set data = excluded.data;
  return h.path;
end $$;
revoke execute on function public.hr_history_list(text, text, integer), public.hr_history_get(bigint), public.hr_history_restore(bigint) from anon, public;
grant execute on function public.hr_history_list(text, text, integer), public.hr_history_get(bigint), public.hr_history_restore(bigint) to authenticated;

-- 90 days of history (daily at 3:30 Manila)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hr-history-trim', '30 19 * * *', $job$ delete from public.hr_doc_history where changed_at < now() - interval '90 days' $job$);
  end if;
end $$;

-- DB4: newest first when no order is given
create or replace function public.hr_query(c text, w jsonb default '[]'::jsonb, ob text default null, dir text default 'asc', lim integer default 1000)
returns setof public.hr_docs
language plpgsql stable security invoker set search_path = public as $$
declare q text := 'select * from public.hr_docs where col = ' || quote_literal(c); cl jsonb; op text;
begin
  for cl in select * from jsonb_array_elements(coalesce(w, '[]'::jsonb)) loop
    op := case cl ->> 1 when '==' then '=' when 'eq' then '=' when '!=' then '<>' when 'ne' then '<>' when '<' then '<' when 'lt' then '<'
      when '<=' then '<=' when 'lte' then '<=' when '>' then '>' when 'gt' then '>' when '>=' then '>=' when 'gte' then '>=' else null end;
    if op is null then raise exception 'unsupported operator %', cl ->> 1; end if;
    q := q || format(' and (data -> %L) %s %L::jsonb', cl ->> 0, op, (cl -> 2)::text);
  end loop;
  if ob is not null then q := q || format(' order by data -> %L %s, path', ob, case when lower(dir) = 'desc' then 'desc' else 'asc' end);
  else q := q || ' order by created_at desc nulls last, updated_at desc nulls last, path'; end if;
  q := q || ' limit ' || greatest(1, least(coalesce(lim, 1000), 5000));
  return query execute q;
end $$;
