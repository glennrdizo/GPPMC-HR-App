-- HR app website: document store, editors and profiles. Separate hr_* names; existing tables are not touched.
create table if not exists public.hr_docs (
  path text primary key,
  col text not null,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists hr_docs_col_idx on public.hr_docs (col);

create table if not exists public.hr_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_owner boolean not null default false,
  added_at timestamptz not null default now()
);
create table if not exists public.hr_owner_emails (email text primary key);
insert into public.hr_owner_emails (email) values ('glennrdizo@gmail.com') on conflict do nothing;

create table if not exists public.hr_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  updated_at timestamptz not null default now()
);

alter table public.hr_docs enable row level security;
alter table public.hr_editors enable row level security;
alter table public.hr_owner_emails enable row level security;
alter table public.hr_profiles enable row level security;
revoke all on public.hr_docs, public.hr_editors, public.hr_owner_emails, public.hr_profiles from anon;

create or replace function public.hr_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hr_editors where user_id = auth.uid())
$$;

create or replace function public.hr_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hr_editors where user_id = auth.uid() and is_owner)
$$;

-- An employee's phone may only touch its own clock-in document and what sits under it.
create or replace function public.hr_is_self(p text) returns boolean
language sql stable set search_path = public as $$
  select auth.uid() is not null and (p = 'clockins/' || auth.uid()::text or p like 'clockins/' || auth.uid()::text || '/%')
$$;

drop policy if exists hr_docs_read on public.hr_docs;
create policy hr_docs_read on public.hr_docs for select to authenticated
  using (public.hr_is_editor() or public.hr_is_self(path) or path like 'pub/%');
drop policy if exists hr_docs_insert on public.hr_docs;
create policy hr_docs_insert on public.hr_docs for insert to authenticated
  with check (public.hr_is_editor() or public.hr_is_self(path));
drop policy if exists hr_docs_update on public.hr_docs;
create policy hr_docs_update on public.hr_docs for update to authenticated
  using (public.hr_is_editor() or public.hr_is_self(path))
  with check (public.hr_is_editor() or public.hr_is_self(path));
drop policy if exists hr_docs_delete on public.hr_docs;
create policy hr_docs_delete on public.hr_docs for delete to authenticated
  using (public.hr_is_editor() or public.hr_is_self(path));

drop policy if exists hr_editors_read on public.hr_editors;
create policy hr_editors_read on public.hr_editors for select to authenticated
  using (public.hr_is_editor() or user_id = auth.uid());

drop policy if exists hr_profiles_read on public.hr_profiles;
create policy hr_profiles_read on public.hr_profiles for select to authenticated
  using (public.hr_is_editor() or user_id = auth.uid());

grant select, insert, update, delete on public.hr_docs to authenticated;
grant select on public.hr_editors, public.hr_profiles to authenticated;

-- Keep path, collection and version consistent on every write.
create or replace function public.hr_docs_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.col := regexp_replace(new.path, '/[^/]+$', '');
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists hr_docs_stamp on public.hr_docs;
create trigger hr_docs_stamp before insert or update on public.hr_docs for each row execute function public.hr_docs_stamp();

-- Deep merge, like the app's update(): objects merge, anything else replaces.
create or replace function public.hr_merge(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb; r jsonb := coalesce(a, '{}'::jsonb);
begin
  if jsonb_typeof(r) <> 'object' or jsonb_typeof(b) <> 'object' then return b; end if;
  for k, v in select * from jsonb_each(b) loop
    if jsonb_typeof(v) = 'object' and jsonb_typeof(r -> k) = 'object' then r := jsonb_set(r, array[k], public.hr_merge(r -> k, v));
    else r := jsonb_set(r, array[k], v); end if;
  end loop;
  return r;
end $$;

create or replace function public.hr_update(p text, patch jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  update public.hr_docs set data = public.hr_merge(data, patch) where path = p returning version into v;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

-- Collection query with the app's where / orderBy / limit, compared as JSON values.
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
  if ob is not null then q := q || format(' order by data -> %L %s', ob, case when lower(dir) = 'desc' then 'desc' else 'asc' end); end if;
  q := q || ' limit ' || greatest(1, least(coalesce(lim, 1000), 5000));
  return query execute q;
end $$;

-- Run at sign-in: records the person's name and email, and makes them an editor when they are the owner
-- or HR invited their (confirmed) email from Users & permissions.
create or replace function public.hr_claim(display_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; inv jsonb; is_ed boolean; is_own boolean;
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
      if inv is not null and exists (select 1 from jsonb_each(inv) e where lower(e.value ->> 'email') = em) then
        insert into public.hr_editors (user_id, email) values (uid, em);
      end if;
    end if;
  end if;
  select true, is_owner into is_ed, is_own from public.hr_editors where user_id = uid;
  return jsonb_build_object('editor', coalesce(is_ed, false), 'owner', coalesce(is_own, false), 'email', em);
end $$;

-- People search for editors (Users & permissions).
create or replace function public.hr_people(q text default '') returns table (user_id uuid, name text, email text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.email from public.hr_profiles p
  where public.hr_is_editor() and (coalesce(q, '') = '' or p.name ilike '%' || q || '%' or p.email ilike '%' || q || '%')
  order by p.name limit 50
$$;

revoke execute on function public.hr_claim(text), public.hr_people(text), public.hr_update(text, jsonb), public.hr_query(text, jsonb, text, text, integer) from anon, public;
grant execute on function public.hr_claim(text), public.hr_people(text), public.hr_update(text, jsonb), public.hr_query(text, jsonb, text, text, integer) to authenticated;

-- Live updates.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hr_docs') then
    alter publication supabase_realtime add table public.hr_docs;
  end if;
end $$;

-- Private file storage (photos, selfies, documents).
insert into storage.buckets (id, name, public, file_size_limit) values ('hr-files', 'hr-files', false, 20971520) on conflict (id) do nothing;
drop policy if exists hr_files_insert on storage.objects;
create policy hr_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'hr-files');
drop policy if exists hr_files_read on storage.objects;
create policy hr_files_read on storage.objects for select to authenticated using (bucket_id = 'hr-files' and (public.hr_is_editor() or owner = auth.uid()));
drop policy if exists hr_files_delete on storage.objects;
create policy hr_files_delete on storage.objects for delete to authenticated using (bucket_id = 'hr-files' and (public.hr_is_editor() or owner = auth.uid()));
