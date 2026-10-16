-- Automatic jobs and notices (Glenn, 2026-10-16): the HR app keeps working when nobody has it open.
-- * hr_events: the database notes every save to the records that can need a message (leave and other requests,
--   payroll runs, applicants), with the record before and after. The hr-jobs edge function reads and clears it.
-- * hr_outbox: every email or SMS the app sends or tried to send, kept 90 days. hr_job_runs: one row a day of what ran.
--   Only the server writes them; Owners, HR Admins and Executives read them through hr_outbox_list() and hr_job_runs_list().
-- * pg_cron calls hr-jobs every 10 minutes with a secret kept in the database vault (created here; nobody needs to copy it).
-- * Settings stay in the app's own records (org/notify). Nothing is sent until an HR Admin switches notices on.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.hr_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text not null,
  col text not null,
  old jsonb,
  new jsonb
);
create table if not exists public.hr_outbox (
  id text primary key,
  at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null,
  to_email text,
  mobile text,
  subject text not null,
  body text not null,
  sms text,
  status text not null default 'QUEUED',
  sms_status text,
  tries integer not null default 0,
  sms_tries integer not null default 0,
  via text,
  err text,
  sent_at timestamptz,
  claim_at timestamptz
);
create index if not exists hr_outbox_wait_idx on public.hr_outbox (updated_at) where status = 'QUEUED' or sms_status = 'QUEUED';
create index if not exists hr_outbox_at_idx on public.hr_outbox (at desc);
create table if not exists public.hr_job_runs (
  day date primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.hr_events enable row level security;
alter table public.hr_outbox enable row level security;
alter table public.hr_job_runs enable row level security;
revoke all on public.hr_events, public.hr_outbox, public.hr_job_runs from anon, authenticated;

-- Note the saves that can need a message. Never blocks the save itself.
create or replace function public.hr_docs_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.col in ('leaves', 'leavereq', 'otreqs', 'attreq', 'flex', 'reimb', 'empchg', 'certreq', 'resign', 'payruns', 'applicants')
     and array_length(string_to_array(new.path, '/'), 1) = 2
     and (tg_op = 'INSERT' or old.data is distinct from new.data) then
    begin
      insert into public.hr_events (path, col, old, new) values (new.path, new.col, case when tg_op = 'UPDATE' then old.data end, new.data);
    exception when others then null;
    end;
  end if;
  return null;
end $$;
revoke execute on function public.hr_docs_event() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_event' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_event after insert or update on public.hr_docs for each row execute function public.hr_docs_event();
  end if;
end $$;

-- The scheduler's secret, made once and kept in the vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'hr_jobs_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hr_jobs_secret', 'Lets pg_cron call the hr-jobs function');
  end if;
end $$;
create or replace function public.hr_jobs_secret_ok(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(length(p) >= 32 and exists (select 1 from vault.decrypted_secrets where name = 'hr_jobs_secret' and decrypted_secret = p), false)
$$;
revoke execute on function public.hr_jobs_secret_ok(text) from anon, public, authenticated;
grant execute on function public.hr_jobs_secret_ok(text) to service_role;

-- Messages waiting to go out, taken by one run at a time (another run skips them for 5 minutes).
create or replace function public.hr_outbox_claim(n integer) returns setof public.hr_outbox
language sql security definer set search_path = public as $$
  update public.hr_outbox o set claim_at = now()
  where o.id in (select x.id from public.hr_outbox x where (x.status = 'QUEUED' or x.sms_status = 'QUEUED')
    and coalesce(x.claim_at, 'epoch'::timestamptz) < now() - interval '5 minutes'
    order by x.updated_at limit greatest(1, least(coalesce(n, 50), 200)) for update skip locked)
  returning o.*
$$;
revoke execute on function public.hr_outbox_claim(integer) from anon, public, authenticated;
grant execute on function public.hr_outbox_claim(integer) to service_role;

-- What the Automatic notices page shows HR Admins.
create or replace function public.hr_outbox_list(lim integer default 200)
returns table (id text, at timestamptz, kind text, to_email text, mobile text, subject text, body text, status text, sms_status text, via text, err text, sent_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query select o.id, o.at, o.kind, o.to_email, o.mobile, o.subject, o.body, o.status, o.sms_status, o.via, o.err, o.sent_at
    from public.hr_outbox o order by o.at desc limit greatest(1, least(coalesce(lim, 200), 1000));
end $$;
create or replace function public.hr_job_runs_list() returns setof public.hr_job_runs
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query select * from public.hr_job_runs r order by r.day desc limit 30;
end $$;
revoke execute on function public.hr_outbox_list(integer), public.hr_job_runs_list() from anon, public;
grant execute on function public.hr_outbox_list(integer), public.hr_job_runs_list() to authenticated;

-- Every 10 minutes. cron.schedule replaces a job of the same name, so running this again is safe.
select cron.schedule('hr-jobs', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://dkrxetzvzxkmhdnvrnqd.supabase.co/functions/v1/hr-jobs',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-hr-jobs', (select decrypted_secret from vault.decrypted_secrets where name = 'hr_jobs_secret')),
    body := '{"cron":true}'::jsonb,
    timeout_milliseconds := 120000)
$job$);
