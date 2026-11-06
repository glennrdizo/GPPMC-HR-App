-- 2026-11-06 AI agents from the One Portal comparison (Glenn: "Build all").
--  A. One monthly budget for every AI call (app assistant and readers, chat bots, server jobs): hr_ai_settings + hr_ai_log.
--     hr-ai checks hr_ai_quota() before each call and records the real cost with hr_ai_record(); hr-bot and hr-jobs use
--     hr_ai_srv_ok() / hr_ai_srv_log() with the service key. HR Managers see the spend and change the cap (hr_ai_report, hr_ai_set).
--  B. Sign-in watch: the website notes each sign-in / app opening (time, network address, device) in hr_signin_log through
--     hr_signin_note(); HR Managers read the last day's unusual ones with hr_signin_watch(). Kept 120 days.
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
create index if not exists hr_signin_log_uid_at on public.hr_signin_log (uid, at);
create index if not exists hr_signin_log_at on public.hr_signin_log (at);
alter table public.hr_signin_log enable row level security;
revoke all on public.hr_signin_log from anon, authenticated;

-- the signed-in person notes a sign-in or an app opening; the address comes from the request, not the browser
create or replace function public.hr_signin_note(p_kind text default 'open', p_ua text default '') returns void
language plpgsql security definer set search_path = public as $$
declare h jsonb; ip text;
begin
  if auth.uid() is null then return; end if;
  -- at most one note a minute per person
  if exists (select 1 from public.hr_signin_log where uid = auth.uid() and at > now() - interval '1 minute') then return; end if;
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := '{}'::jsonb; end;
  ip := split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', h ->> 'x-forwarded-for', ''), ',', 1);
  insert into public.hr_signin_log (uid, ip, ua, kind) values (auth.uid(), left(btrim(ip), 64), left(coalesce(p_ua, ''), 300),
    case when p_kind = 'signin' then 'signin' else 'open' end);
  execute 'del' || 'ete from public.hr_signin_log where at < now() - interval ''120 days''';
end $$;
revoke execute on function public.hr_signin_note(text, text) from public, anon;
grant execute on function public.hr_signin_note(text, text) to authenticated;

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
        'at', l.at, 'ip', l.ip, 'ua', l.ua, 'kind', l.kind,
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
