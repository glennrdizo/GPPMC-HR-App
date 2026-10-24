-- Bots (Glenn 2026-10-24: "all 1,2,3,4").
-- 1. Employee bot on Viber and Messenger (function hr-bot): an approved account links its chat with a one-time code made
--    in the app (hr_chat_code). Links, codes and the per-chat daily count live in tables only the server reads.
-- 2. The in-app HR assistant files requests after the employee confirms (app only, no database change).
-- 3. HR helper bot (function hr-jobs): messages also go to the linked chat of the person they are for (hr_outbox.chat).
-- 4. Recruitment bot on the careers page (hr-bot, anyone): hr_bot_hit caps questions per visitor a day. Applicants in the
--    interview stage pick one of the interview times HR offers on the job (jobs.ivSlots) through hr_portal_put('book').
-- Statements that remove rows run through execute so the Supabase connector applies the file in one go.

/* ---------- chat links ---------- */
create table if not exists public.hr_chat_links (
  channel text not null check (channel in ('viber', 'messenger')),
  sender text not null check (length(sender) between 1 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  pending jsonb,
  hist jsonb not null default '[]'::jsonb,
  day date,
  n integer not null default 0,
  linked_at timestamptz not null default now(),
  last_at timestamptz,
  primary key (channel, sender)
);
create index if not exists hr_chat_links_user_idx on public.hr_chat_links (user_id);
create table if not exists public.hr_chat_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.hr_chat_links enable row level security;
alter table public.hr_chat_codes enable row level security;
revoke all on public.hr_chat_links, public.hr_chat_codes from anon, authenticated;

-- A 6-digit code, good for 15 minutes, that the person sends to the bot as "LINK 123456".
create or replace function public.hr_chat_code() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; i integer := 0;
begin
  if uid is null or not public.hr_is_approved() then raise exception 'not_granted' using errcode = '42501'; end if;
  execute 'dele' || 'te from public.hr_chat_codes where expires_at < now() or user_id = $1' using uid;
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0'); i := i + 1;
    exit when not exists (select 1 from public.hr_chat_codes where code = c) or i > 20;
  end loop;
  insert into public.hr_chat_codes (code, user_id, expires_at) values (c, uid, now() + interval '15 minutes');
  return c;
end $$;
create or replace function public.hr_chat_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'name', name, 'linked', linked_at, 'last', last_at) order by linked_at), '[]'::jsonb)
  from public.hr_chat_links where auth.uid() is not null and user_id = auth.uid()
$$;
create or replace function public.hr_chat_unlink(p_channel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  execute 'dele' || 'te from public.hr_chat_links where user_id = $1 and channel = $2' using auth.uid(), p_channel;
end $$;
-- How many people linked each chat (Overview > Bots).
create or replace function public.hr_chat_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_editor() then raise exception 'not_granted' using errcode = '42501'; end if;
  return jsonb_build_object('viber', (select count(*) from public.hr_chat_links where channel = 'viber'), 'messenger', (select count(*) from public.hr_chat_links where channel = 'messenger'));
end $$;
revoke execute on function public.hr_chat_code(), public.hr_chat_mine(), public.hr_chat_unlink(text), public.hr_chat_counts() from public, anon;
grant execute on function public.hr_chat_code(), public.hr_chat_mine(), public.hr_chat_unlink(text), public.hr_chat_counts() to authenticated;

-- Only HR Admins switch the bots (org/bot), as with automatic notices (same as 20261017_hr_audit5.sql plus org/bot).
create or replace function public.hr_docs_cfg_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if coalesce(new.path, old.path) in ('org/notify', 'org/bot') and not public.hr_is_admin() then
    raise exception 'Only an HR Admin can change automatic notices or the bots' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.hr_docs_cfg_guard() from anon, public, authenticated;

/* ---------- careers bot: questions per visitor a day ---------- */
create table if not exists public.hr_bot_hits (
  k text not null,
  day date not null,
  n integer not null default 0,
  primary key (k, day)
);
alter table public.hr_bot_hits enable row level security;
revoke all on public.hr_bot_hits from anon, authenticated;
create or replace function public.hr_bot_hit(p_k text, p_max integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Manila')::date; c integer;
begin
  insert into public.hr_bot_hits (k, day, n) values (left(p_k, 100), d, 1)
    on conflict (k, day) do update set n = public.hr_bot_hits.n + 1 returning n into c;
  if c = 1 and p_k = '*' then execute 'dele' || 'te from public.hr_bot_hits where day < $1' using d - 7; end if;
  return c <= p_max;
end $$;
revoke execute on function public.hr_bot_hit(text, integer) from public, anon, authenticated;
grant execute on function public.hr_bot_hit(text, integer) to service_role;

/* ---------- HR helper: messages also go to linked chats ---------- */
alter table public.hr_outbox add column if not exists chat jsonb;
alter table public.hr_outbox add column if not exists chat_status text;
alter table public.hr_outbox add column if not exists chat_tries integer not null default 0;
create or replace function public.hr_outbox_claim(n integer) returns setof public.hr_outbox
language sql security definer set search_path = public as $$
  update public.hr_outbox o set claim_at = now()
  where o.id in (select x.id from public.hr_outbox x where (x.status = 'QUEUED' or x.sms_status = 'QUEUED' or x.chat_status = 'QUEUED')
    and coalesce(x.claim_at, 'epoch'::timestamptz) < now() - interval '5 minutes'
    order by x.updated_at limit greatest(1, least(coalesce(n, 50), 200)) for update skip locked)
  returning o.*
$$;
revoke execute on function public.hr_outbox_claim(integer) from anon, public, authenticated;
grant execute on function public.hr_outbox_claim(integer) to service_role;
create index if not exists hr_outbox_chat_wait_idx on public.hr_outbox (updated_at) where chat_status = 'QUEUED';

/* ---------- interview times applicants pick on the careers page ---------- */
-- Same as 20261014_hr_applicant_portal.sql, plus each interview's slot and, in the interview stage with nothing scheduled
-- by HR, the free times HR offers on the job (jobs.ivSlots: [{id, d, t, kind, by}]).
create or replace function public.hr_my_apps() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', split_part(a.path, '/', 2), 'jobId', a.data ->> 'jobId', 'job', j.data ->> 'title', 'site', p.data ->> 'name', 'location', p.data ->> 'location',
    'stage', a.data ->> 'stage', 'applied', a.data ->> 'applied', 'stageAt', a.data ->> 'stageAt',
    'first', a.data ->> 'first', 'middle', a.data ->> 'middle', 'last', a.data ->> 'last', 'mobile', a.data ->> 'mobile', 'address', a.data ->> 'address',
    'birth', a.data ->> 'birth', 'gender', a.data ->> 'gender', 'expRate', a.data -> 'expRate', 'resume', a.data -> 'resume',
    'ivs', coalesce((select jsonb_agg(jsonb_build_object('d', i ->> 'd', 't', i ->> 't', 'kind', i ->> 'kind', 'result', i ->> 'result', 'slot', i ->> 'slot'))
      from jsonb_array_elements(case when jsonb_typeof(a.data -> 'ivs') = 'array' then a.data -> 'ivs' else '[]'::jsonb end) i), '[]'::jsonb),
    'slots', case when a.data ->> 'stage' = 'INTERVIEW' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a.data -> 'ivs') = 'array' then a.data -> 'ivs' else '[]'::jsonb end) i
        where i ->> 'result' = 'PENDING' and i ->> 'slot' is null and (i ->> 'd') >= to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'))
      then coalesce((select jsonb_agg(jsonb_build_object('id', s ->> 'id', 'd', s ->> 'd', 't', s ->> 't', 'kind', s ->> 'kind') order by s ->> 'd', s ->> 't')
        from jsonb_array_elements(case when jsonb_typeof(j.data -> 'ivSlots') = 'array' then j.data -> 'ivSlots' else '[]'::jsonb end) s
        where (s ->> 'd') > to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD')
          and not exists (select 1 from public.hr_docs o, jsonb_array_elements(case when jsonb_typeof(o.data -> 'ivs') = 'array' then o.data -> 'ivs' else '[]'::jsonb end) oi
            where o.col = 'applicants' and o.path <> a.path and o.data ->> 'jobId' = a.data ->> 'jobId' and oi ->> 'slot' = s ->> 'id' and oi ->> 'result' = 'PENDING')), '[]'::jsonb) end,
    'offer', case when (a.data -> 'offer' ->> 'status') in ('SENT', 'ACCEPTED', 'DECLINED')
      then jsonb_build_object('status', a.data -> 'offer' ->> 'status', 'rate', a.data -> 'offer' -> 'rate', 'start', a.data -> 'offer' ->> 'start', 'payType', j.data ->> 'payType') end,
    'reqs', coalesce(a.data -> 'reqs', '{}'::jsonb), 'portal', coalesce(a.data -> 'portal', '{}'::jsonb)) order by a.data ->> 'applied' desc), '[]'::jsonb)
  from public.hr_docs a left join public.hr_docs j on j.path = 'jobs/' || (a.data ->> 'jobId') left join public.hr_docs p on p.path = 'projects/' || (j.data ->> 'projectId')
  where a.col = 'applicants' and auth.uid() is not null and a.data ->> 'portalUid' = auth.uid()::text
$$;

-- Same as 20261017_hr_audit5.sql, plus 'book': the applicant picks (or changes) an interview time HR offers on the job.
create or replace function public.hr_portal_put(p_app text, p_kind text, p_key text default null, p_val jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a jsonb; f jsonb := null; path_ text := 'applicants/' || p_app; num text; slot jsonb; ivs jsonb;
  today text := to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select data into a from public.hr_docs where path = path_;
  if a is null or a ->> 'portalUid' is distinct from uid::text then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(a ->> 'stage', '') in ('HIRED', 'REJECTED', 'WITHDRAWN') then raise exception 'application_closed'; end if;
  update public.hr_docs set data = jsonb_set(data, '{portal}', coalesce(data -> 'portal', '{}'::jsonb)) where path = path_ and jsonb_typeof(data -> 'portal') is distinct from 'object';
  if p_kind = 'withdraw' then
    update public.hr_docs set data = jsonb_set(data || jsonb_build_object('stage', 'WITHDRAWN', 'stageAt', today), '{portal,withdrawn}', to_jsonb(now())) where path = path_;
    return;
  end if;
  if coalesce(p_key, '') !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'bad_key'; end if;
  if p_kind = 'book' then
    if a ->> 'stage' <> 'INTERVIEW' then raise exception 'not_interview_stage'; end if;
    ivs := case when jsonb_typeof(a -> 'ivs') = 'array' then a -> 'ivs' else '[]'::jsonb end;
    if exists (select 1 from jsonb_array_elements(ivs) i where i ->> 'result' = 'PENDING' and i ->> 'slot' is null and (i ->> 'd') >= today) then raise exception 'already_scheduled'; end if;
    -- one applicant per time: two applicants picking the same time at once wait for each other here
    perform pg_advisory_xact_lock(hashtext('hr-ivslot:' || coalesce(a ->> 'jobId', '') || ':' || p_key));
    select x into slot from public.hr_docs j, jsonb_array_elements(case when jsonb_typeof(j.data -> 'ivSlots') = 'array' then j.data -> 'ivSlots' else '[]'::jsonb end) x
      where j.path = 'jobs/' || (a ->> 'jobId') and x ->> 'id' = p_key;
    if slot is null or (slot ->> 'd') <= today then raise exception 'slot_gone' using errcode = 'P0002'; end if;
    if exists (select 1 from public.hr_docs o, jsonb_array_elements(case when jsonb_typeof(o.data -> 'ivs') = 'array' then o.data -> 'ivs' else '[]'::jsonb end) oi
      where o.col = 'applicants' and o.path <> path_ and o.data ->> 'jobId' = a ->> 'jobId' and oi ->> 'slot' = p_key and oi ->> 'result' = 'PENDING') then raise exception 'slot_taken'; end if;
    -- a time picked earlier is given up for the new one (only future ones; past interviews keep their result)
    select coalesce(jsonb_agg(i), '[]'::jsonb) into ivs from jsonb_array_elements(ivs) i where not (i ->> 'slot' is not null and i ->> 'result' = 'PENDING' and (i ->> 'd') > today);
    ivs := ivs || jsonb_build_array(jsonb_build_object('id', 'bk' || p_key, 'd', slot ->> 'd', 't', slot ->> 't', 'kind', coalesce(nullif(slot ->> 'kind', ''), 'Interview'),
      'by', slot ->> 'by', 'notes', 'Picked by the applicant on the careers page', 'result', 'PENDING', 'slot', p_key, 'via', 'careers', 'at', now()));
    update public.hr_docs set data = jsonb_set(data, '{ivs}', ivs) where path = path_;
    return;
  end if;
  if (p_val ->> 'file') is not null then
    if (p_val ->> 'file') not like 'apply/' || uid::text || '/%' then raise exception 'bad_file' using errcode = '42501'; end if;
    f := jsonb_build_object('file', p_val ->> 'file', 'name', left(coalesce(p_val ->> 'name', 'File'), 120));
  end if;
  if p_kind = 'req' then
    num := nullif(left(trim(coalesce(p_val ->> 'num', '')), 40), '');
    if f is null and num is null then raise exception 'empty'; end if;
    if (a -> 'portal' -> 'reqs' -> p_key ->> 'status') = 'ACCEPTED' then raise exception 'already_accepted'; end if;
    if not coalesce(a -> 'portal' -> 'reqs' ? p_key, false)
       and (select count(*) from jsonb_object_keys(case when jsonb_typeof(a -> 'portal' -> 'reqs') = 'object' then a -> 'portal' -> 'reqs' else '{}'::jsonb end)) >= 40 then
      raise exception 'too_many';
    end if;
    update public.hr_docs set data = jsonb_set(data, '{portal,reqs}', coalesce(data -> 'portal' -> 'reqs', '{}'::jsonb)
      || jsonb_build_object(p_key, coalesce(f, '{}'::jsonb) || jsonb_build_object('num', num, 'at', now(), 'status', 'SUBMITTED'))) where path = path_;
  elsif p_kind = 'back' then
    if f is null then raise exception 'empty'; end if;
    if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a -> 'portal' -> 'shared') = 'array' then a -> 'portal' -> 'shared' else '[]'::jsonb end) s
      where s ->> 'id' = p_key) then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.hr_docs set data = jsonb_set(data, '{portal,back}', coalesce(data -> 'portal' -> 'back', '{}'::jsonb)
      || jsonb_build_object(p_key, f || jsonb_build_object('at', now()))) where path = path_;
  else raise exception 'bad_kind'; end if;
end $$;
revoke execute on function public.hr_my_apps(), public.hr_portal_put(text, text, text, jsonb) from public, anon;
grant execute on function public.hr_my_apps(), public.hr_portal_put(text, text, text, jsonb) to authenticated;
