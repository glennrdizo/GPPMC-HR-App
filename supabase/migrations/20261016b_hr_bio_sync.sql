-- Live biometric sync (Glenn, 2026-10-16): ZKTeco TX628 terminals at each site.
-- A small program on a computer at the site (tools/bio-sync) reads new punches from the terminals over the network and
-- sends them here with that site's key. Punches land in clockins/biometric/days/<date>, exactly where the
-- "Import biometric file" page puts them, so Daily time records, the time sheet and payroll use them unchanged.
-- * hr_bio_sites: one row per site key. Only a hash of the key is kept; the key is shown once when HR creates it.
-- * hr_bio_push(key, device, punches): the only thing the program can call. It matches device user ids to employees
--   (biometric id, then employee no., then the number in the employee no.), skips the rest and reports them.
-- * Owners, HR Admins and Executives add, list and revoke site keys (Timekeeping > Biometric import on the website).
-- Safety (audit 2026-10-17, fixed 2026-10-20): a key only covers the employees of the projects it was made for (or head office),
-- accepts punches from the last 35 days only, never into a cutoff that is already final, never changes a punch already saved,
-- and is limited to 30 sends an hour.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.hr_bio_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  revoked_at timestamptz,
  last_at timestamptz,
  last_saved integer,
  last_device jsonb,
  last_unmatched text[] not null default '{}',
  total_saved bigint not null default 0,
  projects text[] not null default '{}', -- project ids this key covers; 'HO' = head office (employees with no project)
  win_start timestamptz,
  win_count integer not null default 0
);
alter table public.hr_bio_sites enable row level security;
revoke all on public.hr_bio_sites from anon, authenticated;

-- Same key the app uses for a punch (employee id + time in base 36), so a punch sent twice, or also imported from a file, is kept once.
create or replace function public.hr_b36(n bigint) returns text
language plpgsql immutable set search_path = public as $$
declare s text := ''; d text := '0123456789abcdefghijklmnopqrstuvwxyz';
begin
  if n = 0 then return '0'; end if;
  while n > 0 loop s := substr(d, (n % 36)::int + 1, 1) || s; n := n / 36; end loop;
  return s;
end $$;

create or replace function public.hr_bio_push(p_key text, p_device jsonb default '{}'::jsonb, p_punches jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare site public.hr_bio_sites; x jsonb; uid text; ts timestamptz; emp text; st text; d text; k text; pid text;
  days jsonb := '{}'::jsonb; by_bio jsonb; by_no jsonb; by_num jsonb; saved int := 0; unmatched text[] := '{}'; bad int := 0; closed int := 0;
begin
  select * into site from public.hr_bio_sites where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null;
  if site.id is null then raise exception 'bad_key' using errcode = '28000'; end if;
  if jsonb_typeof(p_punches) <> 'array' or jsonb_array_length(p_punches) > 5000 then raise exception 'too_many' using errcode = '22023'; end if;
  if site.win_start is not null and site.win_start > now() - interval '1 hour' and site.win_count >= 30 then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.hr_bio_sites set win_start = case when win_start is null or win_start <= now() - interval '1 hour' then now() else win_start end,
    win_count = case when win_start is null or win_start <= now() - interval '1 hour' then 1 else win_count + 1 end where id = site.id;

  -- the key's employees, looked up by biometric id, employee no., and the number in the employee no. (first one wins)
  with e as (select split_part(path, '/', 2) id, nullif(trim(data ->> 'bioId'), '') bio, lower(trim(data ->> 'no')) no,
      nullif(regexp_replace(coalesce(data ->> 'no', ''), '\D', '', 'g'), '')::numeric::text num, created_at
    from public.hr_docs where col = 'employees' and (data -> 'separated' is null or jsonb_typeof(data -> 'separated') = 'null')
      and (coalesce(nullif(data ->> 'projectId', ''), 'HO') = any(site.projects)))
  select (select coalesce(jsonb_object_agg(bio, id), '{}') from (select distinct on (bio) bio, id from e where bio is not null order by bio, created_at) a),
         (select coalesce(jsonb_object_agg(no, id), '{}') from (select distinct on (no) no, id from e where no is not null and no <> '' order by no, created_at) b),
         (select coalesce(jsonb_object_agg(num, id), '{}') from (select distinct on (num) num, id from e where num is not null order by num, created_at) c)
    into by_bio, by_no, by_num;

  for x in select * from jsonb_array_elements(p_punches) loop
    uid := trim(coalesce(x ->> 'id', ''));
    begin ts := ((x ->> 't') || '+08')::timestamptz; exception when others then ts := null; end;
    if uid = '' or uid !~ '^[A-Za-z0-9_.-]{1,24}$' or ts is null or ts > now() + interval '1 hour' or ts < now() - interval '35 days' then bad := bad + 1; continue; end if;
    emp := coalesce(by_bio ->> uid, by_no ->> lower(uid), case when uid ~ '^\d+$' then by_num ->> (uid::numeric::text) end);
    if emp is null then if not uid = any(unmatched) and cardinality(unmatched) < 200 then unmatched := unmatched || uid; end if; continue; end if;
    st := x ->> 's';
    d := to_char(ts at time zone 'Asia/Manila', 'YYYY-MM-DD');
    pid := left(d, 7) || case when right(d, 2)::int <= 15 then '-1' else '-2' end; -- the pay cutoff of that day
    if exists (select 1 from public.hr_docs where path = 'periods/' || pid and data ->> 'status' = 'FINAL') then closed := closed + 1; continue; end if;
    k := emp || '-' || public.hr_b36((extract(epoch from ts) * 1000)::bigint);
    days := jsonb_set(days, array[d], coalesce(days -> d, '{}'::jsonb) || jsonb_build_object(k, jsonb_build_object(
      'empId', emp, 't', to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'type', case when st in ('0', '4') then 'IN' when st in ('1', '5') then 'OUT' end, 'site', site.name)));
    saved := saved + 1;
  end loop;

  insert into public.hr_docs (path, col, data) values ('clockins/biometric', 'clockins', '{"bio": true, "name": "Biometric terminals"}'::jsonb) on conflict (path) do nothing;
  for d in select jsonb_object_keys(days) loop
    insert into public.hr_docs (path, col, data) values ('clockins/biometric/days/' || d, 'clockins/biometric/days', jsonb_build_object('d', d, 'dev', 'biometric', 'punches', days -> d))
      -- punches already saved win: a resend, or a key in the wrong hands, can add punches but never change one
      on conflict (path) do update set data = jsonb_set(public.hr_docs.data, '{punches}', (excluded.data -> 'punches') || coalesce(public.hr_docs.data -> 'punches', '{}'::jsonb));
  end loop;
  update public.hr_bio_sites set last_at = now(), last_saved = saved, last_unmatched = unmatched, total_saved = total_saved + saved,
    last_device = coalesce(nullif(jsonb_strip_nulls(jsonb_build_object('name', left(p_device ->> 'name', 60), 'ip', left(p_device ->> 'ip', 40), 'sn', left(p_device ->> 'sn', 40), 'agent', left(p_device ->> 'agent', 20))), '{}'::jsonb), last_device)
    where id = site.id;
  return jsonb_build_object('saved', saved, 'days', (select count(*) from jsonb_object_keys(days)), 'unmatched', to_jsonb(unmatched), 'bad', bad, 'closed', closed, 'site', site.name);
end $$;
revoke execute on function public.hr_bio_push(text, jsonb, jsonb) from public;
grant execute on function public.hr_bio_push(text, jsonb, jsonb) to anon, authenticated;

-- Site keys, for Owners, HR Admins and Executives.
create or replace function public.hr_bio_site_add(p_name text, p_projects text[]) returns text
language plpgsql security definer set search_path = public as $$
declare k text := 'bio_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or length(p_name) > 80 then raise exception 'bad_name' using errcode = '22023'; end if;
  if coalesce(cardinality(p_projects), 0) = 0 or cardinality(p_projects) > 20
     or exists (select 1 from unnest(p_projects) p where p <> 'HO' and not exists (select 1 from public.hr_docs where path = 'projects/' || p)) then
    raise exception 'bad_projects' using errcode = '22023'; end if;
  insert into public.hr_bio_sites (name, key_hash, projects) values (trim(p_name), encode(extensions.digest(k, 'sha256'), 'hex'), p_projects);
  return k;
end $$;
create or replace function public.hr_bio_site_list() returns table (id uuid, name text, created_at timestamptz, revoked_at timestamptz, last_at timestamptz, last_saved integer, last_device jsonb, last_unmatched text[], total_saved bigint, projects text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query select s.id, s.name, s.created_at, s.revoked_at, s.last_at, s.last_saved, s.last_device, s.last_unmatched, s.total_saved, s.projects from public.hr_bio_sites s order by s.revoked_at nulls first, s.name;
end $$;
create or replace function public.hr_bio_site_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  update public.hr_bio_sites set revoked_at = now() where id = p_id and revoked_at is null;
end $$;
revoke execute on function public.hr_bio_site_add(text, text[]), public.hr_bio_site_list(), public.hr_bio_site_revoke(uuid) from anon, public;
grant execute on function public.hr_bio_site_add(text, text[]), public.hr_bio_site_list(), public.hr_bio_site_revoke(uuid) to authenticated;
