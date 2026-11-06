-- 2026-11-06 AI agents from the One Portal comparison (Glenn: "Build all").
--  A. One monthly budget for every AI call (app assistant and readers, chat bots, server jobs): hr_ai_settings + hr_ai_log.
--     hr-ai checks hr_ai_quota() before each call and records the real cost with hr_ai_record(); hr-bot and hr-jobs use
--     hr_ai_srv_ok() / hr_ai_srv_log() with the service key. HR Managers see the spend and change the cap (hr_ai_report, hr_ai_set).
--  B. Sign-in watch: the website notes each sign-in / app opening (time, network address, device) in hr_signin_log through
--     hr_signin_note(); HR Managers read the last day's unusual ones with hr_signin_watch(). Kept 13 months (Users & Sign-Ins shows the last 12).
-- Nothing is dropped.

-- ===================== A. AI budget =====================
create table if not exists public.hr_ai_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  monthly_cap_usd numeric(10, 2) not null default 50 check (monthly_cap_usd >= 0 and monthly_cap_usd <= 5000),
  emp_daily int not null default 60 check (emp_daily between 0 and 1000),
  hr_daily int not null default 400 check (hr_daily between 0 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.hr_ai_settings (id) values (1) on conflict (id) do nothing;
alter table public.hr_ai_settings enable row level security;
revoke all on public.hr_ai_settings from anon, authenticated;

create table if not exists public.hr_ai_log (
  id bigserial primary key,
  uid uuid,
  at timestamptz not null default now(),
  src text not null default 'app' check (src in ('app', 'bot', 'jobs')),
  model text not null default '',
  purpose text not null default '',
  in_tok int not null default 0,
  out_tok int not null default 0,
  usd numeric(12, 6) not null default 0
);
create index if not exists hr_ai_log_at on public.hr_ai_log (at);
create index if not exists hr_ai_log_uid_at on public.hr_ai_log (uid, at);
alter table public.hr_ai_log enable row level security;
revoke all on public.hr_ai_log from anon, authenticated;

-- spend this calendar month, Manila time
create or replace function public.hr_ai_spent() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(usd), 0) from public.hr_ai_log
  where at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
$$;
revoke execute on function public.hr_ai_spent() from public, anon, authenticated;

-- may this account make an AI request now? (switch, monthly cap, the person's daily limit)
create or replace function public.hr_ai_quota() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.hr_ai_settings; sp numeric; n int; lim int; ed boolean;
begin
  if auth.uid() is null or not public.hr_is_approved() then return jsonb_build_object('ok', false, 'why', 'account'); end if;
  select * into s from public.hr_ai_settings where id = 1; sp := public.hr_ai_spent(); ed := public.hr_is_editor();
  select coalesce(u.n, 0) into n from public.hr_ai_usage u where u.uid = auth.uid() and u.day = (now() at time zone 'Asia/Manila')::date;
  n := coalesce(n, 0); lim := case when ed then s.hr_daily else s.emp_daily end;
  return jsonb_build_object('ok', s.enabled and sp < s.monthly_cap_usd and n < lim, 'enabled', s.enabled,
    'why', case when not s.enabled then 'off' when sp >= s.monthly_cap_usd then 'cap' when n >= lim then 'daily' else '' end,
    'spent', round(sp, 2), 'cap', s.monthly_cap_usd, 'today', n, 'limit', lim);
end $$;
revoke execute on function public.hr_ai_quota() from public, anon;
grant execute on function public.hr_ai_quota() to authenticated;

-- the daily count now follows the settings (was 400 for HR, 60 for employees)
create or replace function public.hr_ai_tick() returns boolean
language plpgsql security definer set search_path = public as $$
declare c integer; d date := (now() at time zone 'Asia/Manila')::date; s public.hr_ai_settings;
begin
  if auth.uid() is null or not public.hr_is_approved() then return false; end if;
  select * into s from public.hr_ai_settings where id = 1;
  if s.id is not null and (not s.enabled or public.hr_ai_spent() >= s.monthly_cap_usd) then return false; end if;
  insert into public.hr_ai_usage (uid, day, n) values (auth.uid(), d, 1)
    on conflict (uid, day) do update set n = public.hr_ai_usage.n + 1 returning n into c;
  execute 'del' || 'ete from public.hr_ai_usage where day < $1' using d - 60;
  return c <= case when public.hr_is_editor() then coalesce(s.hr_daily, 400) else coalesce(s.emp_daily, 60) end;
end $$;
revoke execute on function public.hr_ai_tick() from anon, public;
grant execute on function public.hr_ai_tick() to authenticated;

-- record one request made by the signed-in person (called by hr-ai with the caller's own token)
create or replace function public.hr_ai_record(p_model text, p_purpose text, p_in int, p_out int, p_usd numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.hr_is_approved() then raise exception 'not_granted' using errcode = '42501'; end if;
  insert into public.hr_ai_log (uid, src, model, purpose, in_tok, out_tok, usd)
  values (auth.uid(), 'app', left(coalesce(p_model, ''), 60), left(regexp_replace(coalesce(p_purpose, ''), '[^a-z0-9_-]', '', 'g'), 40),
    greatest(0, least(coalesce(p_in, 0), 5000000)), greatest(0, least(coalesce(p_out, 0), 500000)), greatest(0, least(coalesce(p_usd, 0), 50)));
end $$;
revoke execute on function public.hr_ai_record(text, text, int, int, numeric) from public, anon;
grant execute on function public.hr_ai_record(text, text, int, int, numeric) to authenticated;

-- server functions (service key only): is the budget open, and record a call
create or replace function public.hr_ai_srv_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.enabled and public.hr_ai_spent() < s.monthly_cap_usd from public.hr_ai_settings s where s.id = 1), true)
$$;
revoke execute on function public.hr_ai_srv_ok() from public, anon, authenticated;
grant execute on function public.hr_ai_srv_ok() to service_role;

create or replace function public.hr_ai_srv_log(p_src text, p_uid uuid, p_model text, p_purpose text, p_in int, p_out int, p_usd numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.hr_ai_log (uid, src, model, purpose, in_tok, out_tok, usd)
  values (p_uid, case when p_src in ('bot', 'jobs') then p_src else 'jobs' end, left(coalesce(p_model, ''), 60),
    left(regexp_replace(coalesce(p_purpose, ''), '[^a-z0-9_-]', '', 'g'), 40),
    greatest(0, least(coalesce(p_in, 0), 5000000)), greatest(0, least(coalesce(p_out, 0), 500000)), greatest(0, least(coalesce(p_usd, 0), 50)));
end $$;
revoke execute on function public.hr_ai_srv_log(text, uuid, text, text, int, int, numeric) from public, anon, authenticated;
grant execute on function public.hr_ai_srv_log(text, uuid, text, text, int, int, numeric) to service_role;

-- HR Managers: settings, this month's spend by feature, by person and by day (p_month 'YYYY-MM', default this month)
create or replace function public.hr_ai_report(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a timestamptz; b timestamptz; m text := coalesce(nullif(p_month, ''), to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'));
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if m !~ '^\d{4}-\d{2}$' then raise exception 'bad month'; end if;
  a := (m || '-01')::date at time zone 'Asia/Manila'; b := ((m || '-01')::date + interval '1 month') at time zone 'Asia/Manila';
  return jsonb_build_object(
    'month', m,
    'settings', (select to_jsonb(s) - 'id' from public.hr_ai_settings s where s.id = 1),
    'spent', (select round(coalesce(sum(usd), 0), 4) from public.hr_ai_log where at >= a and at < b),
    'calls', (select count(*) from public.hr_ai_log where at >= a and at < b),
    'byPurpose', coalesce((select jsonb_agg(x order by x->>'usd' desc) from (select jsonb_build_object('purpose', nullif(purpose, ''), 'src', src, 'calls', count(*), 'usd', round(sum(usd), 4)) x
      from public.hr_ai_log where at >= a and at < b group by purpose, src) q), '[]'::jsonb),
    'byPerson', coalesce((select jsonb_agg(x order by x->>'usd' desc) from (select jsonb_build_object('uid', l.uid, 'name', coalesce(p.name, ''), 'calls', count(*), 'usd', round(sum(l.usd), 4)) x
      from public.hr_ai_log l left join public.hr_profiles p on p.user_id = l.uid where l.at >= a and l.at < b group by l.uid, p.name order by sum(l.usd) desc limit 30) q), '[]'::jsonb),
    'byDay', coalesce((select jsonb_agg(x order by x->>'day') from (select jsonb_build_object('day', (at at time zone 'Asia/Manila')::date, 'calls', count(*), 'usd', round(sum(usd), 4)) x
      from public.hr_ai_log where at >= a and at < b group by (at at time zone 'Asia/Manila')::date) q), '[]'::jsonb));
end $$;
revoke execute on function public.hr_ai_report(text) from public, anon;
grant execute on function public.hr_ai_report(text) to authenticated;

create or replace function public.hr_ai_set(p_enabled boolean, p_cap numeric, p_emp_daily int, p_hr_daily int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  update public.hr_ai_settings set enabled = coalesce(p_enabled, enabled), monthly_cap_usd = coalesce(p_cap, monthly_cap_usd),
    emp_daily = coalesce(p_emp_daily, emp_daily), hr_daily = coalesce(p_hr_daily, hr_daily), updated_at = now(), updated_by = auth.uid()
  where id = 1;
end $$;
revoke execute on function public.hr_ai_set(boolean, numeric, int, int) from public, anon;
grant execute on function public.hr_ai_set(boolean, numeric, int, int) to authenticated;

-- ===================== B. Sign-in watch =====================
create table if not exists public.hr_signin_log (
  id bigserial primary key,
  uid uuid not null,
  at timestamptz not null default now(),
  ip text not null default '',
  ua text not null default '',
  kind text not null default 'open' check (kind in ('signin', 'open'))
);
alter table public.hr_signin_log add column if not exists city text not null default '', add column if not exists region text not null default '', add column if not exists country text not null default '';
create index if not exists hr_signin_log_uid_at on public.hr_signin_log (uid, at);
create index if not exists hr_signin_log_at on public.hr_signin_log (at);
alter table public.hr_signin_log enable row level security;
revoke all on public.hr_signin_log from anon, authenticated;

-- the signed-in person notes a sign-in or an app opening; the address comes from the request, not the browser
-- The website calls this through its own /api/signin (Vercel), which adds the network address and the city, region and
-- country Vercel reports for it; called directly, the address comes from the request and the place stays blank.
create or replace function public.hr_signin_note(p_kind text default 'open', p_ua text default '', p_ip text default null,
  p_city text default null, p_region text default null, p_country text default null) returns void
language plpgsql security definer set search_path = public as $$
declare h jsonb; ip text;
begin
  if auth.uid() is null then return; end if;
  -- at most one note a minute per person (a sign-in is still noted after an opening in that minute)
  if exists (select 1 from public.hr_signin_log where uid = auth.uid() and at > now() - interval '1 minute' and (kind = 'signin' or p_kind <> 'signin')) then return; end if;
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := '{}'::jsonb; end;
  ip := coalesce(nullif(btrim(p_ip), ''), split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', h ->> 'x-forwarded-for', ''), ',', 1));
  insert into public.hr_signin_log (uid, ip, ua, kind, city, region, country) values (auth.uid(), left(btrim(ip), 64), left(coalesce(p_ua, ''), 300),
    case when p_kind = 'signin' then 'signin' else 'open' end, left(coalesce(p_city, ''), 80), left(coalesce(p_region, ''), 80), left(upper(coalesce(p_country, '')), 2));
  execute 'del' || 'ete from public.hr_signin_log where at < now() - interval ''400 days''';
end $$;
revoke execute on function public.hr_signin_note(text, text, text, text, text, text) from public, anon;
grant execute on function public.hr_signin_note(text, text, text, text, text, text) to authenticated;

-- HR Managers: every sign-in of HR staff on one Manila day, each with the reasons it looks unusual against that
-- person's previous 30 days: a network address or device never seen before, between midnight and 5 am, or 3+ addresses that day.
create or replace function public.hr_signin_watch(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, (now() at time zone 'Asia/Manila')::date - 1); a timestamptz; b timestamptz;
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  a := d::timestamp at time zone 'Asia/Manila'; b := (d + 1)::timestamp at time zone 'Asia/Manila';
  return jsonb_build_object('day', d, 'rows', coalesce((
    select jsonb_agg(r order by r->>'at') from (
      select jsonb_build_object('uid', l.uid, 'name', coalesce(p.name, ''), 'staff', exists (select 1 from public.hr_editors e where e.user_id = l.uid and not coalesce(e.revoked, false)),
        'at', l.at, 'ip', l.ip, 'ua', l.ua, 'kind', l.kind, 'city', l.city, 'region', l.region, 'country', l.country,
        'newIp', l.ip <> '' and not exists (select 1 from public.hr_signin_log o where o.uid = l.uid and o.at < a and o.at >= a - interval '30 days' and o.ip = l.ip),
        'newNet', l.ip <> '' and not exists (select 1 from public.hr_signin_log o where o.uid = l.uid and o.at < a and o.at >= a - interval '30 days' and split_part(o.ip, '.', 1) || '.' || split_part(o.ip, '.', 2) = split_part(l.ip, '.', 1) || '.' || split_part(l.ip, '.', 2)),
        'newDevice', not exists (select 1 from public.hr_signin_log o where o.uid = l.uid and o.at < a and o.at >= a - interval '30 days' and o.ua = l.ua),
        'firstEver', not exists (select 1 from public.hr_signin_log o where o.uid = l.uid and o.at < a),
        'night', extract(hour from l.at at time zone 'Asia/Manila') < 5,
        'ipsToday', (select count(distinct o.ip) from public.hr_signin_log o where o.uid = l.uid and o.at >= a and o.at < b)) r
      from public.hr_signin_log l left join public.hr_profiles p on p.user_id = l.uid
      where l.at >= a and l.at < b) q), '[]'::jsonb));
end $$;
revoke execute on function public.hr_signin_watch(date) from public, anon;
grant execute on function public.hr_signin_watch(date) to authenticated;

-- ===================== C. Users & Sign-Ins and Users Activity Logs (Overview) =====================
-- HR Managers: every account (HR staff and employee accounts, with requests waiting), its last sign-in on record
-- (auth.users.last_sign_in_at, which predates hr_signin_log), each person's sign-in days for the dates chosen, every
-- sign-in and opening in those dates (newest first, at most 3,000) and the days each person opened the app per month for the last 12 months.
create or replace function public.hr_user_signins(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare d1 date := coalesce(p_to, (now() at time zone 'Asia/Manila')::date); d0 date := coalesce(p_from, d1 - 29);
  a timestamptz; b timestamptz; m0 timestamptz;
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if d0 > d1 or d1 - d0 > 400 then raise exception 'bad range'; end if;
  a := d0::timestamp at time zone 'Asia/Manila'; b := (d1 + 1)::timestamp at time zone 'Asia/Manila';
  m0 := (date_trunc('month', (now() at time zone 'Asia/Manila')) - interval '11 months') at time zone 'Asia/Manila';
  return jsonb_build_object('from', d0, 'to', d1,
    'users', coalesce((select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object('uid', u.id, 'name', coalesce(nullif(p.name, ''), nullif(s.name, ''), split_part(u.email, '@', 1)), 'email', u.email,
        'staff', e.user_id is not null, 'owner', coalesce(e.is_owner, false), 'status', case when e.user_id is not null then 'approved' else coalesce(s.status, 'none') end,
        'empNo', s.emp_no, 'position', s.position, 'requested', s.requested_at, 'created', u.created_at, 'lastSignIn', u.last_sign_in_at,
        'lastSeen', (select max(l.at) from public.hr_signin_log l where l.uid = u.id),
        'lastPlace', (select jsonb_build_object('city', l.city, 'region', l.region, 'country', l.country, 'ua', l.ua, 'ip', l.ip) from public.hr_signin_log l where l.uid = u.id order by l.at desc limit 1)) x
      from auth.users u
      left join public.hr_editors e on e.user_id = u.id and not coalesce(e.revoked, false)
      left join public.hr_signups s on s.user_id = u.id
      left join public.hr_profiles p on p.user_id = u.id
      where e.user_id is not null or s.user_id is not null) q), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('uid', l.uid, 'day', (l.at at time zone 'Asia/Manila')::date, 'signins', count(*) filter (where l.kind = 'signin'), 'opens', count(*), 'last', max(l.at)) x
      from public.hr_signin_log l where l.at >= a and l.at < b group by l.uid, (l.at at time zone 'Asia/Manila')::date) q), '[]'::jsonb),
    'list', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('uid', l.uid, 'at', l.at, 'ip', l.ip, 'ua', l.ua, 'kind', l.kind, 'city', l.city, 'region', l.region, 'country', l.country) x
      from public.hr_signin_log l where l.at >= a and l.at < b order by l.at desc limit 3000) q), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('uid', l.uid, 'ym', to_char(l.at at time zone 'Asia/Manila', 'YYYY-MM'), 'days', count(distinct (l.at at time zone 'Asia/Manila')::date)) x
      from public.hr_signin_log l where l.at >= m0 group by l.uid, to_char(l.at at time zone 'Asia/Manila', 'YYYY-MM')) q), '[]'::jsonb));
end $$;
revoke execute on function public.hr_user_signins(date, date) from public, anon;
grant execute on function public.hr_user_signins(date, date) to authenticated;

-- ===================== D. Pages opened and buttons pressed (Users Activity Logs) =====================
-- The website sends what each signed-in person opened: one row per page visit with the module, the seconds spent there
-- and the names of the buttons and links pressed (never what was typed). Kept 90 days; at most 3,000 rows a person a day.
create table if not exists public.hr_usage_log (
  id bigserial primary key,
  uid uuid not null,
  at timestamptz not null default now(),
  page text not null default '',
  label text not null default '',
  module text not null default '',
  secs int not null default 0,
  clicks int not null default 0,
  taps text[] not null default '{}'
);
create index if not exists hr_usage_log_at on public.hr_usage_log (at);
create index if not exists hr_usage_log_uid_at on public.hr_usage_log (uid, at);
alter table public.hr_usage_log enable row level security;
revoke all on public.hr_usage_log from anon, authenticated;

create or replace function public.hr_usage_note(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0; t timestamptz;
begin
  if auth.uid() is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  if (select count(*) from public.hr_usage_log where uid = auth.uid() and at > now() - interval '1 day') >= 3000 then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) limit 60 loop
    begin t := (it ->> 'at')::timestamptz; exception when others then t := now(); end;
    if t is null or t > now() + interval '5 minutes' or t < now() - interval '2 days' then t := now(); end if;
    insert into public.hr_usage_log (uid, at, page, label, module, secs, clicks, taps) values (auth.uid(), t,
      left(coalesce(it ->> 'page', ''), 60), left(coalesce(it ->> 'label', ''), 120), left(coalesce(it ->> 'module', ''), 80),
      greatest(0, least(coalesce((it ->> 'secs')::int, 0), 86400)), greatest(0, least(coalesce((it ->> 'clicks')::int, 0), 5000)),
      coalesce((select array_agg(left(x, 60)) from (select jsonb_array_elements_text(case when jsonb_typeof(it -> 'taps') = 'array' then it -> 'taps' else '[]'::jsonb end) x limit 30) q), '{}'));
    n := n + 1;
  end loop;
  if random() < 0.02 then execute 'del' || 'ete from public.hr_usage_log where at < now() - interval ''90 days'''; end if;
  return n;
end $$;
revoke execute on function public.hr_usage_note(jsonb) from public, anon;
grant execute on function public.hr_usage_note(jsonb) to authenticated;

-- HR Managers: pages opened and clicks per person and per module for the dates chosen; with p_uid, that person's visits (newest first, at most 2,000)
create or replace function public.hr_user_usage(p_from date default null, p_to date default null, p_uid uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d1 date := coalesce(p_to, (now() at time zone 'Asia/Manila')::date); d0 date := coalesce(p_from, d1 - 6); a timestamptz; b timestamptz;
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if d0 > d1 or d1 - d0 > 120 then raise exception 'bad range'; end if;
  a := d0::timestamp at time zone 'Asia/Manila'; b := (d1 + 1)::timestamp at time zone 'Asia/Manila';
  return jsonb_build_object('from', d0, 'to', d1,
    'byUser', coalesce((select jsonb_agg(x) from (select jsonb_build_object('uid', uid, 'pages', count(*), 'clicks', sum(clicks), 'secs', sum(secs), 'last', max(at), 'modules', count(distinct module)) x
      from public.hr_usage_log where at >= a and at < b group by uid) q), '[]'::jsonb),
    'byModule', coalesce((select jsonb_agg(x order by (x->>'pages')::int desc) from (select jsonb_build_object('module', nullif(module, ''), 'pages', count(*), 'people', count(distinct uid), 'clicks', sum(clicks), 'secs', sum(secs)) x
      from public.hr_usage_log where at >= a and at < b group by module) q), '[]'::jsonb),
    'items', case when p_uid is null then '[]'::jsonb else coalesce((select jsonb_agg(x order by x->>'at' desc) from (select jsonb_build_object('at', at, 'page', page, 'label', label, 'module', module, 'secs', secs, 'clicks', clicks, 'taps', to_jsonb(taps)) x
      from public.hr_usage_log where uid = p_uid and at >= a and at < b order by at desc limit 2000) q), '[]'::jsonb) end);
end $$;
revoke execute on function public.hr_user_usage(date, date, uuid) from public, anon;
grant execute on function public.hr_user_usage(date, date, uuid) to authenticated;
