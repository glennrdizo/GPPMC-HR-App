-- Security audit #5 (2026-10-17). Not applied yet: needs "execute". Tested on local Postgres 16 (58 cases). Create-or-replace / alter only, idempotent, no DROP.
-- Sections (each can be removed on its own):
--   A. auth_rls_initplan: the same policies, with per-statement (select ...) wrappers. Semantics identical.
--   B. W7  "No access" editors stop reading records (read policy uses hr_is_staff()).
--   C. W1/W2/W13 employee self paths clockins/<uid>/...: shape, size, append-only punches stamped with server time,
--      no employee-set empId on punches, processed fixes/decisions frozen.
--   D. W3  org/notify (automatic emails/SMS) only by HR Admins, Owners, Executives.
--   E. W6  bulk update/delete through the API (more than 50 rows in one statement) only by HR Admins.
--   F. W9  upload rate limit for accounts that can't change records (employees, applicants, new sign-ups).
--   G. W10 applicant caps (applications per day / in total, requirement keys); W11 display name length.
--   H. W4  per-person daily limit for the HR assistant (hr_ai_tick; the hr-ai function must call it, see web.patch).
--   I. W15 trigger functions are not callable through the API.
-- Run on a branch / local copy first. Everything below runs as the migration owner (postgres).

-- ===================== A. initplan wrappers (same meaning) =====================
alter policy hr_docs_read on public.hr_docs
  using (((select public.hr_is_editor()) or ((select public.hr_is_approved()) and (public.hr_is_self(path) or path like 'pub/%')))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col <> 'hrdreg' or coalesce(data ->> 'reg', '') !~ '^hrdr?_(16|17|30|37)(_|$)' or (select public.hr_can_er()))
    and (col <> 'audit' or (select public.hr_can_audit()) or (data ->> 'uid') = (select auth.uid())::text));
alter policy hr_docs_insert on public.hr_docs
  with check (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf())));
alter policy hr_docs_update on public.hr_docs
  using (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf())))
  with check (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf())));
alter policy hr_docs_delete on public.hr_docs
  using (((select public.hr_can_write()) or ((select public.hr_is_approved()) and public.hr_is_self(path))) and (path not like 'conf/%' or (select public.hr_can_conf())));
alter policy hr_editors_read on public.hr_editors using ((select public.hr_is_editor()) or user_id = (select auth.uid()));
alter policy hr_profiles_read on public.hr_profiles using ((select public.hr_is_editor()) or user_id = (select auth.uid()));
alter policy hr_signups_read on public.hr_signups using (user_id = (select auth.uid()) or (select public.hr_is_admin()));
alter policy hr_files_read on storage.objects using (bucket_id = 'hr-files' and ((select public.hr_is_editor()) or owner = (select auth.uid())));
alter policy hr_files_portal_read on storage.objects using (bucket_id = 'hr-files' and (name like 'forms/%' or name like 'share/' || (select auth.uid())::text || '/%'));
alter policy hr_files_delete on storage.objects using (bucket_id = 'hr-files' and ((select public.hr_can_write()) or owner = (select auth.uid())));

-- ===================== B. W7: role "No access" really means no records =====================
create or replace function public.hr_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and public.hr_role() <> 'none'
$$;
revoke execute on function public.hr_is_staff() from anon, public;
grant execute on function public.hr_is_staff() to authenticated;
alter policy hr_docs_read on public.hr_docs
  using (((select public.hr_is_staff()) or ((select public.hr_is_approved()) and (public.hr_is_self(path) or path like 'pub/%')))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col <> 'hrdreg' or coalesce(data ->> 'reg', '') !~ '^hrdr?_(16|17|30|37)(_|$)' or (select public.hr_can_er()))
    and (col <> 'audit' or (select public.hr_can_audit()) or (data ->> 'uid') = (select auth.uid())::text));

-- ===================== C. W1/W2/W13: what an employee's phone may write =====================
-- Applies only to signed-in people who are not HR editors (their RLS already limits them to clockins/<own uid>...).
-- * clockins/<uid>: the device record; kiosk/biometric/adjust flags are dropped.
-- * clockins/<uid>/(days|fixes|decide|loans|loanfiles|tickets)/<id> only; nothing deeper, nothing under me/ (HR writes the summary).
-- * days/: punches already saved can't be changed or removed and the day can't be deleted; a new punch gets the server time
--   in "srv", and its "t" is replaced by the server time when the phone's clock is more than 15 minutes off (kept as "tDev").
--   Employee punches never carry empId, rev, revBy, revAt or adj (the app attributes phone punches by HR's link).
-- * fixes/ and decide/: once HR's app marked one done it can't be changed.
-- * each record at most 400 kB of JSON; at most 5000 records per sub-collection; at most 30 punches a day.
create or replace function public.hr_docs_self_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := auth.uid()::text; p text := coalesce(new.path, old.path); base text; rest text; sub text; k text; v jsonb; t timestamptz; n integer;
  now_s text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or p not like 'clockins/%' or public.hr_is_editor() then return coalesce(new, old); end if;
  base := 'clockins/' || me;
  if p = base then
    if tg_op = 'DELETE' then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.data := new.data - 'kiosk' - 'bio' - 'adj' - 'adjust';
    return new;
  end if;
  if p not like base || '/%' then return coalesce(new, old); end if; -- someone else's path: RLS refuses it
  rest := substr(p, length(base) + 2); sub := split_part(rest, '/', 1);
  if rest !~ '^(days|fixes|decide|loans|loanfiles|tickets)/[^/]+$' then raise exception 'Not allowed here' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then
    if sub = 'days' then raise exception 'Time records can''t be deleted' using errcode = '42501'; end if;
    return old;
  end if;
  if octet_length(new.data::text) > 400000 then raise exception 'Too large' using errcode = '54000'; end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = regexp_replace(new.path, '/[^/]+$', '');
    if n >= 5000 then raise exception 'Too many records' using errcode = '54000'; end if;
  end if;
  if sub in ('fixes', 'decide') and tg_op = 'UPDATE' and (old.data ->> 'done') = 'true' then
    raise exception 'Already processed' using errcode = '42501';
  end if;
  if sub = 'days' then
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
      v := v - 'empId' - 'rev' - 'revBy' - 'revAt' - 'adj' - 'srv' - 'tDev';
      if t is null or abs(extract(epoch from (t - now()))) > 900 then v := v || jsonb_build_object('tDev', new.data -> 'punches' -> k -> 't', 't', now_s); end if;
      new.data := jsonb_set(new.data, array['punches', k], v || jsonb_build_object('srv', now_s));
    end loop;
    if (select count(*) from jsonb_object_keys(coalesce(new.data -> 'punches', '{}'::jsonb))) > 30 then raise exception 'Too many punches' using errcode = '54000'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.hr_docs_self_guard() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_self_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_self_guard before insert or update or delete on public.hr_docs for each row execute function public.hr_docs_self_guard();
  end if;
end $$;

-- ===================== D. W3: automatic notice settings =====================
create or replace function public.hr_docs_cfg_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if coalesce(new.path, old.path) = 'org/notify' and not public.hr_is_admin() then
    raise exception 'Only an HR Admin can change automatic notices' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.hr_docs_cfg_guard() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_cfg_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_cfg_guard before insert or update or delete on public.hr_docs for each row execute function public.hr_docs_cfg_guard();
  end if;
end $$;

-- ===================== E. W6: no bulk wipes through the API =====================
-- The app changes one record per call; a PATCH/DELETE with a broad filter is not something it does.
create or replace function public.hr_docs_bulk_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or public.hr_is_admin() then return null; end if;
  if tg_op = 'DELETE' then select count(*) into n from old_rows; else select count(*) into n from new_rows; end if;
  if n > 50 then raise exception 'Too many records in one change (%). Ask an HR Admin.', n using errcode = '42501'; end if;
  return null;
end $$;
revoke execute on function public.hr_docs_bulk_guard() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_bulk_del' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_bulk_del after delete on public.hr_docs referencing old table as old_rows for each statement execute function public.hr_docs_bulk_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_bulk_upd' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_bulk_upd after update on public.hr_docs referencing new table as new_rows for each statement execute function public.hr_docs_bulk_guard();
  end if;
end $$;

-- ===================== F. W9: upload rate limit =====================
create or replace function public.hr_upload_ok() returns boolean
language sql stable security definer set search_path = public, storage as $$
  select public.hr_can_write() or (select count(*) from storage.objects o
    where o.bucket_id = 'hr-files' and o.owner = auth.uid() and o.created_at > now() - interval '1 day') < 100
$$;
revoke execute on function public.hr_upload_ok() from anon, public;
grant execute on function public.hr_upload_ok() to authenticated;
alter policy hr_files_insert on storage.objects
  with check (bucket_id = 'hr-files' and ((select public.hr_can_write()) or ((select public.hr_is_approved()) and name !~ '/' and (select public.hr_upload_ok()))));
alter policy hr_files_apply_insert on storage.objects
  with check (bucket_id = 'hr-files' and name like 'apply/' || (select auth.uid())::text || '/%' and (select public.hr_upload_ok()));

-- ===================== G. W10/W11: applicant caps, display name =====================
create or replace function public.hr_apply(p_job text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; j jsonb; cur_path text; cur jsonb; aid text; d jsonb; res jsonb; src text; n integer;
  today text := to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select lower(email), email_confirmed_at into em, ok from auth.users where id = uid;
  if ok is null then raise exception 'email_not_confirmed' using errcode = '42501'; end if;
  select data into j from public.hr_docs where path = 'jobs/' || p_job;
  if j is null or j ->> 'status' <> 'OPEN' or coalesce(j ->> 'careersHide', 'false') = 'true' then raise exception 'job_closed' using errcode = 'P0002'; end if;
  if coalesce(trim(p ->> 'first'), '') = '' or coalesce(trim(p ->> 'last'), '') = '' or coalesce(trim(p ->> 'mobile'), '') = '' then raise exception 'missing_fields'; end if;
  if coalesce(p ->> 'consent', '') <> 'true' then raise exception 'consent_required'; end if;
  res := p -> 'resume';
  if jsonb_typeof(res) = 'object' and (res ->> 'id') like 'apply/' || uid::text || '/%' then res := jsonb_build_object('id', res ->> 'id', 'name', left(coalesce(res ->> 'name', 'Resume'), 120)); else res := null; end if;
  src := case lower(coalesce(p ->> 'src', '')) when 'linkedin' then 'LinkedIn' when 'facebook' then 'Facebook' when 'fb' then 'Facebook' when 'jobstreet' then 'JobStreet'
    when 'indeed' then 'Indeed' when 'referral' then 'Referral' else 'Company website' end;
  d := jsonb_build_object(
    'first', left(trim(p ->> 'first'), 60), 'middle', nullif(left(trim(coalesce(p ->> 'middle', '')), 60), ''), 'last', left(trim(p ->> 'last'), 60),
    'mobile', left(trim(p ->> 'mobile'), 30), 'email', em, 'address', nullif(left(trim(coalesce(p ->> 'address', '')), 200), ''),
    'birth', case when (p ->> 'birth') ~ '^\d{4}-\d{2}-\d{2}$' then p ->> 'birth' end, 'gender', case when (p ->> 'gender') in ('M', 'F') then p ->> 'gender' end,
    'expRate', case when (p ->> 'expRate') ~ '^\d{1,7}(\.\d{1,2})?$' then (p ->> 'expRate')::numeric end,
    'notes', nullif(left(trim(coalesce(p ->> 'notes', '')), 2000), ''));
  if res is not null then d := d || jsonb_build_object('resume', res); end if;
  select path, data into cur_path, cur from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text and data ->> 'jobId' = p_job limit 1;
  if cur_path is not null then
    if cur ->> 'stage' = 'APPLIED' then update public.hr_docs set data = data || d where path = cur_path; end if;
    return split_part(cur_path, '/', 2);
  end if;
  select count(*) into n from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text and coalesce(data ->> 'stage', '') not in ('HIRED', 'REJECTED', 'WITHDRAWN');
  if n >= 5 then raise exception 'too_many_applications'; end if;
  -- New (audit #5): withdrawn applications count too, so withdraw-and-apply can't be looped.
  select count(*) into n from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text and data ->> 'applied' = today;
  if n >= 5 then raise exception 'too_many_applications'; end if;
  select count(*) into n from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text;
  if n >= 30 then raise exception 'too_many_applications'; end if;
  aid := substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 16);
  insert into public.hr_docs (path, col, data) values ('applicants/' || aid, 'applicants', d || jsonb_build_object(
    'id', aid, 'jobId', p_job, 'stage', 'APPLIED', 'stageAt', today, 'applied', today, 'source', src, 'ivs', '[]'::jsonb, 'reqs', '{}'::jsonb,
    'portalUid', uid::text, 'portal', jsonb_build_object('via', 'careers', 'consent', jsonb_build_object('v', left(coalesce(p ->> 'dpaV', ''), 20), 'at', now()))));
  return aid;
end $$;

create or replace function public.hr_portal_put(p_app text, p_kind text, p_key text default null, p_val jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a jsonb; f jsonb := null; path_ text := 'applicants/' || p_app; num text;
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
  if (p_val ->> 'file') is not null then
    if (p_val ->> 'file') not like 'apply/' || uid::text || '/%' then raise exception 'bad_file' using errcode = '42501'; end if;
    f := jsonb_build_object('file', p_val ->> 'file', 'name', left(coalesce(p_val ->> 'name', 'File'), 120));
  end if;
  if p_kind = 'req' then
    num := nullif(left(trim(coalesce(p_val ->> 'num', '')), 40), '');
    if f is null and num is null then raise exception 'empty'; end if;
    if (a -> 'portal' -> 'reqs' -> p_key ->> 'status') = 'ACCEPTED' then raise exception 'already_accepted'; end if;
    -- New (audit #5): at most 40 different requirement keys per application.
    if not coalesce(a -> 'portal' -> 'reqs' ? p_key, false)
       and (select count(*) from jsonb_object_keys(case when jsonb_typeof(a -> 'portal' -> 'reqs') = 'object' then a -> 'portal' -> 'reqs' else '{}'::jsonb end)) >= 40 then
      raise exception 'too_many';
    end if;
    update public.hr_docs set data = jsonb_set(data, '{portal,reqs}', coalesce(data -> 'portal' -> 'reqs', '{}'::jsonb)
      || jsonb_build_object(p_key, coalesce(f, '{}'::jsonb) || jsonb_build_object('num', num, 'at', now(), 'status', 'SUBMITTED'))) where path = path_;
  elsif p_kind = 'back' then
    if f is null then raise exception 'empty'; end if;
    if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a -> 'portal' -> 'shared') = 'array' then a -> 'portal' -> 'shared' else '[]'::jsonb end) s where s ->> 'id' = p_key)
      then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.hr_docs set data = jsonb_set(data, '{portal,back}', coalesce(data -> 'portal' -> 'back', '{}'::jsonb)
      || jsonb_build_object(p_key, f || jsonb_build_object('at', now()))) where path = path_;
  else raise exception 'bad_kind'; end if;
end $$;

create or replace function public.hr_claim(display_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; inv jsonb; is_ed boolean; is_own boolean; invited boolean := false; st text; hn text;
begin
  if uid is null then return jsonb_build_object('editor', false); end if;
  select lower(email), email_confirmed_at into em, ok from auth.users where id = uid;
  -- New (audit #5): the name is capped at 120 characters with control characters removed.
  insert into public.hr_profiles (user_id, name, email) values (uid, nullif(left(trim(regexp_replace(coalesce(display_name, ''), '[[:cntrl:]]', ' ', 'g')), 120), ''), em)
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
  select status, hr_note into st, hn from public.hr_signups where user_id = uid;
  if coalesce(is_ed, false) then st := 'approved'; end if;
  return jsonb_build_object('editor', coalesce(is_ed, false), 'owner', coalesce(is_own, false), 'email', em, 'access', coalesce(st, 'none'), 'hr_note', hn);
end $$;

-- ===================== H. W4: HR assistant daily limit =====================
create table if not exists public.hr_ai_usage (
  uid uuid not null,
  day date not null,
  n integer not null default 0,
  primary key (uid, day)
);
alter table public.hr_ai_usage enable row level security;
revoke all on public.hr_ai_usage from anon, authenticated;
-- One call per Claude request (a question with tool use makes up to 6). Editors 400 a day, employees 60.
create or replace function public.hr_ai_tick() returns boolean
language plpgsql security definer set search_path = public as $$
declare c integer; d date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null or not public.hr_is_approved() then return false; end if;
  insert into public.hr_ai_usage (uid, day, n) values (auth.uid(), d, 1)
    on conflict (uid, day) do update set n = public.hr_ai_usage.n + 1 returning n into c;
  delete from public.hr_ai_usage where day < d - 60;
  return c <= case when public.hr_is_editor() then 400 else 60 end;
end $$;
revoke execute on function public.hr_ai_tick() from anon, public;
grant execute on function public.hr_ai_tick() to authenticated;

-- ===================== I. W15: trigger functions are never API calls =====================
-- (Trigger functions need EXECUTE only when the trigger is created, not when it fires.)
revoke execute on function public.hr_docs_guard(), public.hr_docs_id_guard(), public.hr_audit_guard() from authenticated;
revoke execute on function public.hr_docs_stamp() from anon, public, authenticated;

-- ===================== J. Reliable reads of big collections =====================
-- The website reads collections over 1,000 records in pages. Without an order the pages could overlap or skip records,
-- so a list (the 201 masterlist, requests) could come back with people missing. Same query, with a fixed order by path.
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
  else q := q || ' order by path'; end if;
  q := q || ' limit ' || greatest(1, least(coalesce(lim, 1000), 5000));
  return query execute q;
end $$;
