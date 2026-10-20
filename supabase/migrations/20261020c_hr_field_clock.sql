-- Field clock-in (Glenn 2026-10-20: full automation; audit 2026-10-17 H3, H4, M3), on top of 20261017g.
-- H4 Offline punches: a phone with no signal keeps the punch and sends it later marked offline. The server keeps the phone's
--    time only for an offline punch from the last 48 hours, on its own day, in a cutoff that isn't final yet; it is marked
--    offline and needsOk so HR checks it (Geofence review) before it counts. Any other punch still gets the server's time.
-- M3 Kiosk punches saved by an HR sign-in (clockins/kiosk-<site>) also get the server's time unless sent offline.
-- H3 Kiosk tablets: a gate tablet no longer needs an HR sign-in. HR makes a kiosk key for one site (Clock in > Site
--    kiosk on the website); the tablet opens /kiosk with it and can only (a) list that site's people by employee no. and
--    short name, and (b) save a time in or out for one of them with the server's time and the site's geofence rule.
--    A PIN set with the key is needed to remove the key from the tablet. 600 punches an hour per key.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create or replace function public.hr_docs_self_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := auth.uid()::text; p text := coalesce(new.path, old.path); base text; rest text; sub text; k text; v jsonb; t timestamptz; n integer;
  now_s text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); day text; off boolean; pid text;
begin
  if auth.uid() is null or p not like 'clockins/%' then return coalesce(new, old); end if;
  if public.hr_is_editor() then
    -- M3: kiosk punches saved by an HR sign-in get the server's time too (offline ones from the last 48 hours keep theirs)
    if tg_op <> 'DELETE' and p ~ '^clockins/kiosk-[^/]+/days/[^/]+$' then
      for k, v in select * from jsonb_each(coalesce(new.data -> 'punches', '{}'::jsonb)) loop
        if tg_op = 'UPDATE' and (old.data -> 'punches') ? k then continue; end if;
        if jsonb_typeof(v) <> 'object' then continue; end if;
        begin t := (v ->> 't')::timestamptz; exception when others then t := null; end;
        off := (v ->> 'offline') = 'true' and t is not null and t > now() - interval '48 hours' and t < now() + interval '2 minutes'
          and to_char(t at time zone 'Asia/Manila', 'YYYY-MM-DD') = split_part(p, '/', 4);
        if off then v := v || jsonb_build_object('offline', true, 'needsOk', true, 'srv', now_s);
        elsif t is null or abs(extract(epoch from (t - now()))) > 900 then v := (v - 'offline') || jsonb_build_object('tDev', v -> 't', 't', now_s, 'srv', now_s);
        else v := (v - 'offline') || jsonb_build_object('srv', now_s); end if;
        new.data := jsonb_set(new.data, array['punches', k], v);
      end loop;
    end if;
    return coalesce(new, old);
  end if;
  base := 'clockins/' || me;
  if p = base then
    if tg_op = 'DELETE' then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.data := new.data - 'kiosk' - 'bio' - 'adj' - 'adjust';
    return new;
  end if;
  if p not like base || '/%' then return coalesce(new, old); end if; -- someone else's path: RLS refuses it
  rest := substr(p, length(base) + 2); sub := split_part(rest, '/', 1);
  if rest !~ '^(days|fixes|decide|loans|loanfiles|tickets|reqs)/[^/]+$' then raise exception 'Not allowed here' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then
    if sub = 'days' then raise exception 'Time records can''t be deleted' using errcode = '42501'; end if;
    if sub in ('fixes', 'decide', 'reqs', 'loans', 'loanfiles') and (old.data ->> 'done') = 'true' then
      raise exception 'Already processed' using errcode = '42501'; end if;
    return old;
  end if;
  -- HR's claim on a record (hr_take) is HR's to write: an employee's copy is dropped and HR's kept.
  new.data := new.data - 'claim';
  if tg_op = 'UPDATE' and (old.data ? 'claim') then new.data := new.data || jsonb_build_object('claim', old.data -> 'claim'); end if;
  if octet_length(new.data::text) > 400000 then raise exception 'Too large' using errcode = '54000'; end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = regexp_replace(new.path, '/[^/]+$', '');
    if n >= 5000 then raise exception 'Too many records' using errcode = '54000'; end if;
  end if;
  -- daily caps on what an employee's account can add (audit 2026-10-17 S1/S4): counted on when records were created
  if tg_op = 'INSERT' and sub in ('reqs', 'loans', 'loanfiles', 'tickets') and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = base || '/' || sub and created_at > now() - interval '1 day';
    if n >= (case sub when 'reqs' then 30 when 'loans' then 10 when 'loanfiles' then 120 else 30 end) then
      raise exception 'Too many today. Try again tomorrow or ask HR.' using errcode = '54000';
    end if;
  end if;
  if sub in ('fixes', 'decide', 'reqs') and tg_op = 'UPDATE' and (old.data ->> 'done') = 'true' then
    raise exception 'Already processed' using errcode = '42501';
  end if;
  if sub = 'days' then
    day := split_part(rest, '/', 2);
    if (new.data ? 'punches') and jsonb_typeof(new.data -> 'punches') <> 'object' then raise exception 'Bad punches' using errcode = '22023'; end if;
    if tg_op = 'UPDATE' then
      if (new.data -> 'd') is distinct from (old.data -> 'd') or (new.data -> 'dev') is distinct from (old.data -> 'dev') then
        raise exception 'Saved punches can''t be changed' using errcode = '42501';
      end if;
      for k, v in select * from jsonb_each(coalesce(old.data -> 'punches', '{}'::jsonb)) loop
        if (new.data -> 'punches' -> k) is distinct from v then raise exception 'Saved punches can''t be changed' using errcode = '42501'; end if;
      end loop;
    end if;
    for k, v in select * from jsonb_each(coalesce(new.data -> 'punches', '{}'::jsonb)) loop
      if tg_op = 'UPDATE' and (old.data -> 'punches') ? k then continue; end if;
      if jsonb_typeof(v) <> 'object' then raise exception 'Bad punch' using errcode = '22023'; end if;
      begin t := (v ->> 't')::timestamptz; exception when others then t := null; end;
      -- H4: an offline punch keeps the phone's time when it is from the last 48 hours, on this day, in an open cutoff
      off := (v ->> 'offline') = 'true' and t is not null and t > now() - interval '48 hours' and t < now() + interval '2 minutes'
        and to_char(t at time zone 'Asia/Manila', 'YYYY-MM-DD') = day;
      if off then
        pid := left(day, 7) || case when right(day, 2)::int <= 15 then '-1' else '-2' end;
        if exists (select 1 from public.hr_docs where path = 'periods/' || pid and data ->> 'status' = 'FINAL') then off := false; end if;
      end if;
      v := v - 'empId' - 'rev' - 'revBy' - 'revAt' - 'adj' - 'srv' - 'tDev' - 'offline';
      if off then v := v || jsonb_build_object('offline', true, 'needsOk', true);
      elsif t is null or abs(extract(epoch from (t - now()))) > 900 then v := v || jsonb_build_object('tDev', new.data -> 'punches' -> k -> 't', 't', now_s); end if;
      new.data := jsonb_set(new.data, array['punches', k], v || jsonb_build_object('srv', now_s));
    end loop;
    if (select count(*) from jsonb_object_keys(coalesce(new.data -> 'punches', '{}'::jsonb))) > 30 then raise exception 'Too many punches' using errcode = '54000'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.hr_docs_self_guard() from anon, public, authenticated;

-- H3: kiosk tablets
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.hr_kiosks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site text not null, -- 'office' (head office) or a project id
  key_hash text not null unique,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  revoked_at timestamptz,
  last_at timestamptz,
  total integer not null default 0,
  win_start timestamptz,
  win_count integer not null default 0,
  pin_fails integer not null default 0
);
alter table public.hr_kiosks enable row level security;
revoke all on public.hr_kiosks from anon, authenticated;

create or replace function public.hr_kiosk_get(p_key text) returns public.hr_kiosks
language sql stable security definer set search_path = public as $$
  select * from public.hr_kiosks where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null
$$;
revoke execute on function public.hr_kiosk_get(text) from anon, public, authenticated;

-- The people a kiosk may punch: active employees assigned to its site, by employee no. and first name plus last initial.
create or replace function public.hr_kiosk_roster(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ks public.hr_kiosks := public.hr_kiosk_get(p_key); g jsonb; nm text;
begin
  if ks.id is null then raise exception 'bad_key' using errcode = '28000'; end if;
  if ks.site = 'office' then select data -> 'officeGeo' into g from public.hr_docs where path = 'org/settings';
  else select data -> 'geo', data ->> 'name' into g, nm from public.hr_docs where path = 'projects/' || ks.site; end if;
  return jsonb_build_object('name', ks.name, 'site', ks.site, 'siteName', case when ks.site = 'office' then 'Head office' else coalesce(nm, ks.name) end,
    'geo', case when jsonb_typeof(g) = 'object' then jsonb_build_object('lat', g -> 'lat', 'lng', g -> 'lng', 'radius', coalesce(g -> 'radius', '150'::jsonb)) end,
    'mode', coalesce((select data ->> 'fenceMode' from public.hr_docs where path = 'org/settings'), 'RECORD'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', split_part(d.path, '/', 2), 'no', d.data ->> 'no',
        'name', trim(coalesce(d.data ->> 'first', '') || ' ' || left(coalesce(d.data ->> 'last', ''), 1) || case when coalesce(d.data ->> 'last', '') <> '' then '.' else '' end))
        order by d.data ->> 'first', d.data ->> 'last')
      from public.hr_docs d where d.col = 'employees' and (d.data -> 'separated' is null or jsonb_typeof(d.data -> 'separated') = 'null')
        and coalesce(d.data ->> 'sample', '') <> 'true'
        and case when ks.site = 'office' then coalesce(d.data ->> 'projectId', '') = '' or not exists (select 1 from public.hr_docs x where x.path = 'projects/' || (d.data ->> 'projectId'))
                 else d.data ->> 'projectId' = ks.site end), '[]'::jsonb));
end $$;

-- One time in or out. The time is the server's, unless the tablet had no signal (offline): then its time is kept when it is
-- from the last 48 hours in an open cutoff, and the punch waits for HR. The site's geofence rule is applied here.
create or replace function public.hr_kiosk_punch(p_key text, p_emp text, p_type text, p_photo text default null, p_lat double precision default null,
  p_lng double precision default null, p_acc integer default null, p_geo_error text default null, p_why text default null, p_t timestamptz default null, p_offline boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ks public.hr_kiosks := public.hr_kiosk_get(p_key); e jsonb; g jsonb; mode text; t timestamptz := now(); off boolean := false; d text; pid text;
  dist integer; rad numeric; st text; ask boolean := false; dev text; k text; v jsonb; why text := nullif(left(trim(coalesce(p_why, '')), 300), '');
begin
  if ks.id is null then raise exception 'bad_key' using errcode = '28000'; end if;
  if ks.win_start is not null and ks.win_start > now() - interval '1 hour' and ks.win_count >= 600 then raise exception 'rate_limited' using errcode = '54000'; end if;
  update public.hr_kiosks set win_start = case when win_start is null or win_start <= now() - interval '1 hour' then now() else win_start end,
    win_count = case when win_start is null or win_start <= now() - interval '1 hour' then 1 else win_count + 1 end where id = ks.id;
  if p_type not in ('IN', 'OUT') then raise exception 'bad_type' using errcode = '22023'; end if;
  if p_photo is not null and (length(p_photo) > 60000 or p_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then raise exception 'bad_photo' using errcode = '22023'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad_location' using errcode = '22023'; end if;
  select data into e from public.hr_docs where path = 'employees/' || coalesce(p_emp, '') and col = 'employees';
  if e is null or not (e -> 'separated' is null or jsonb_typeof(e -> 'separated') = 'null')
     or not (case when ks.site = 'office' then coalesce(e ->> 'projectId', '') = '' or not exists (select 1 from public.hr_docs x where x.path = 'projects/' || (e ->> 'projectId'))
                 else e ->> 'projectId' = ks.site end) then
    raise exception 'not_here' using errcode = '42501'; end if;
  if p_offline and p_t is not null and p_t > now() - interval '48 hours' and p_t < now() + interval '2 minutes' then
    d := to_char(p_t at time zone 'Asia/Manila', 'YYYY-MM-DD'); pid := left(d, 7) || case when right(d, 2)::int <= 15 then '-1' else '-2' end;
    if exists (select 1 from public.hr_docs where path = 'periods/' || pid and data ->> 'status' = 'FINAL') then raise exception 'closed' using errcode = '42501'; end if;
    t := p_t; off := true;
  end if;
  d := to_char(t at time zone 'Asia/Manila', 'YYYY-MM-DD');
  -- geofence: same rule as the phones (geox.js fenceBlocks / fenceAsks)
  mode := coalesce((select data ->> 'fenceMode' from public.hr_docs where path = 'org/settings'), 'RECORD');
  if ks.site = 'office' then select data -> 'officeGeo' into g from public.hr_docs where path = 'org/settings';
  else select data -> 'geo' into g from public.hr_docs where path = 'projects/' || ks.site; end if;
  if p_lat is null then st := 'nogps';
  elsif jsonb_typeof(g) <> 'object' or g ->> 'lat' is null then st := 'nofence';
  else
    dist := round(2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - (g ->> 'lat')::float8) / 2), 2)
      + cos(radians((g ->> 'lat')::float8)) * cos(radians(p_lat)) * power(sin(radians(p_lng - (g ->> 'lng')::float8) / 2), 2))));
    rad := coalesce((g ->> 'radius')::numeric, 150) + least(coalesce(p_acc, 0), 100);
    st := case when dist <= rad then 'in' else 'out' end;
  end if;
  if (mode = 'BLOCK' and st in ('out', 'nogps')) or (mode = 'MIXED' and st = 'out') then raise exception 'outside' using errcode = '42501'; end if;
  ask := (mode = 'APPROVE' and st in ('out', 'nogps')) or (mode = 'MIXED' and st = 'nogps');
  if ask and why is null then raise exception 'reason_needed' using errcode = '22023'; end if;
  if off and why is null then why := 'Saved on the kiosk with no signal; sent when it was back online'; end if;
  dev := 'kiosk-' || ks.site; k := p_emp || '-' || public.hr_b36((extract(epoch from t) * 1000)::bigint);
  v := jsonb_strip_nulls(jsonb_build_object('t', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'type', p_type, 'empId', p_emp, 'site', ks.site,
    'photo', p_photo, 'lat', p_lat, 'lng', p_lng, 'acc', p_acc, 'geoError', left(p_geo_error, 80), 'fstate', st, 'dist', dist, 'why', why,
    'needsOk', case when ask or off then true end, 'offline', case when off then true end, 'kioskKey', ks.id::text,
    'srv', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  insert into public.hr_docs (path, col, data) values ('clockins/' || dev, 'clockins', jsonb_build_object('kiosk', true, 'site', ks.site, 'name', 'Kiosk: ' || ks.name)) on conflict (path) do nothing;
  insert into public.hr_docs (path, col, data) values ('clockins/' || dev || '/days/' || d, 'clockins/' || dev || '/days', jsonb_build_object('d', d, 'dev', dev, 'punches', jsonb_build_object(k, v)))
    -- a punch already saved wins: a resend never changes it
    on conflict (path) do update set data = jsonb_set(public.hr_docs.data, '{punches}', jsonb_build_object(k, v) || coalesce(public.hr_docs.data -> 'punches', '{}'::jsonb));
  update public.hr_kiosks set last_at = now(), total = total + 1 where id = ks.id;
  return jsonb_build_object('t', v ->> 't', 'name', trim(coalesce(e ->> 'first', '') || ' ' || left(coalesce(e ->> 'last', ''), 1) || '.'), 'state', st, 'waits', coalesce((v ->> 'needsOk')::boolean, false), 'offline', off);
end $$;

-- The PIN that lets someone remove the key from the tablet. Five wrong tries lock it until HR makes a new key.
create or replace function public.hr_kiosk_pin(p_key text, p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ks public.hr_kiosks := public.hr_kiosk_get(p_key); ok boolean;
begin
  if ks.id is null then return true; end if; -- a revoked key can be removed freely
  if ks.pin_fails >= 5 then raise exception 'locked' using errcode = '42501'; end if;
  ok := ks.pin_hash = encode(extensions.digest(ks.id::text || ':' || coalesce(p_pin, ''), 'sha256'), 'hex');
  update public.hr_kiosks set pin_fails = case when ok then 0 else pin_fails + 1 end where id = ks.id;
  return ok;
end $$;
revoke execute on function public.hr_kiosk_roster(text), public.hr_kiosk_punch(text, text, text, text, double precision, double precision, integer, text, text, timestamptz, boolean), public.hr_kiosk_pin(text, text) from public;
grant execute on function public.hr_kiosk_roster(text), public.hr_kiosk_punch(text, text, text, text, double precision, double precision, integer, text, text, timestamptz, boolean), public.hr_kiosk_pin(text, text) to anon, authenticated;

-- Kiosk keys, for Owners, HR Managers and Executives.
create or replace function public.hr_kiosk_add(p_name text, p_site text, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare k text := 'ksk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); i uuid := gen_random_uuid();
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or length(p_name) > 80 then raise exception 'bad_name' using errcode = '22023'; end if;
  if coalesce(p_pin, '') !~ '^\d{4,8}$' then raise exception 'bad_pin' using errcode = '22023'; end if;
  if p_site is null or (p_site <> 'office' and not exists (select 1 from public.hr_docs where path = 'projects/' || p_site)) then raise exception 'bad_site' using errcode = '22023'; end if;
  insert into public.hr_kiosks (id, name, site, key_hash, pin_hash) values (i, trim(p_name), p_site, encode(extensions.digest(k, 'sha256'), 'hex'), encode(extensions.digest(i::text || ':' || p_pin, 'sha256'), 'hex'));
  return k;
end $$;
create or replace function public.hr_kiosk_list() returns table (id uuid, name text, site text, created_at timestamptz, revoked_at timestamptz, last_at timestamptz, total integer, locked boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query select s.id, s.name, s.site, s.created_at, s.revoked_at, s.last_at, s.total, s.pin_fails >= 5 from public.hr_kiosks s order by s.revoked_at nulls first, s.name;
end $$;
create or replace function public.hr_kiosk_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  update public.hr_kiosks set revoked_at = now() where id = p_id and revoked_at is null;
end $$;
revoke execute on function public.hr_kiosk_add(text, text, text), public.hr_kiosk_list(), public.hr_kiosk_revoke(uuid) from anon, public;
grant execute on function public.hr_kiosk_add(text, text, text), public.hr_kiosk_list(), public.hr_kiosk_revoke(uuid) to authenticated;
