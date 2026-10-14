-- Applicant portal (Glenn 2026-10-14): a public careers page, online applications, and an applicant account
-- where each applicant sees only their own applications, uploads requirements and signs documents.
-- Applicants never read hr_docs directly: every read and write goes through the functions below, which
-- return or change only the applicant's own records and only the fields meant for them.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

-- Open jobs for the careers page. Anyone may call it, signed in or not.
create or replace function public.hr_careers() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company', coalesce((select data ->> 'companyName' from public.hr_docs where path = 'org/main'), 'GD Prime Property Management Corporation'),
    'how', t.data ->> 'applyHow',
    'reqs', t.data -> 'portalReqs',
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f ->> 'id', 'name', f ->> 'name', 'file', f ->> 'file', 'note', f ->> 'note'))
      from jsonb_array_elements(case when jsonb_typeof(t.data -> 'portalForms') = 'array' then t.data -> 'portalForms' else '[]'::jsonb end) f), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', split_part(j.path, '/', 2), 'title', j.data ->> 'title', 'desc', j.data ->> 'desc', 'empType', j.data ->> 'empType', 'payType', j.data ->> 'payType',
        'rate', case when coalesce(t.data ->> 'careersHidePay', 'false') = 'true' then null else j.data -> 'rate' end,
        'slots', j.data -> 'slots', 'opened', j.data ->> 'opened', 'site', p.data ->> 'name',
        'location', coalesce(p.data ->> 'location', t.data ->> 'hoAddress', 'Head Office')) order by j.data ->> 'opened' desc)
      from public.hr_docs j left join public.hr_docs p on p.path = 'projects/' || (j.data ->> 'projectId')
      where j.col = 'jobs' and j.data ->> 'status' = 'OPEN' and coalesce(j.data ->> 'sample', 'false') <> 'true' and coalesce(j.data ->> 'careersHide', 'false') <> 'true'), '[]'::jsonb))
  from (select 1) x left join public.hr_docs t on t.path = 'org/talent'
$$;

-- Applications HR entered by hand (walk-ins, referrals) join the applicant's account when they sign up with the same confirmed email.
create or replace function public.hr_portal_link() returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; n integer;
begin
  if uid is null then return 0; end if;
  select lower(email), email_confirmed_at into em, ok from auth.users where id = uid;
  if ok is null or coalesce(em, '') = '' then return 0; end if;
  update public.hr_docs set data = data || jsonb_build_object('portalUid', uid::text)
    where col = 'applicants' and coalesce(data ->> 'portalUid', '') = '' and lower(data ->> 'email') = em
      and coalesce(data ->> 'stage', '') not in ('HIRED', 'REJECTED', 'WITHDRAWN');
  get diagnostics n = row_count; return n;
end $$;

-- Apply for an open job (or update the details while the application is still new).
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
  aid := substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 16);
  insert into public.hr_docs (path, col, data) values ('applicants/' || aid, 'applicants', d || jsonb_build_object(
    'id', aid, 'jobId', p_job, 'stage', 'APPLIED', 'stageAt', today, 'applied', today, 'source', src, 'ivs', '[]'::jsonb, 'reqs', '{}'::jsonb,
    'portalUid', uid::text, 'portal', jsonb_build_object('via', 'careers', 'consent', jsonb_build_object('v', left(coalesce(p ->> 'dpaV', ''), 20), 'at', now()))));
  return aid;
end $$;

-- Record ids live in the path (the app keeps them out of the stored data).
-- The applicant's own applications, with only what is meant for them (no HR notes, ratings or interviewer remarks).
create or replace function public.hr_my_apps() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', split_part(a.path, '/', 2), 'jobId', a.data ->> 'jobId', 'job', j.data ->> 'title', 'site', p.data ->> 'name', 'location', p.data ->> 'location',
    'stage', a.data ->> 'stage', 'applied', a.data ->> 'applied', 'stageAt', a.data ->> 'stageAt',
    'first', a.data ->> 'first', 'middle', a.data ->> 'middle', 'last', a.data ->> 'last', 'mobile', a.data ->> 'mobile', 'address', a.data ->> 'address',
    'birth', a.data ->> 'birth', 'gender', a.data ->> 'gender', 'expRate', a.data -> 'expRate', 'resume', a.data -> 'resume',
    'ivs', coalesce((select jsonb_agg(jsonb_build_object('d', i ->> 'd', 't', i ->> 't', 'kind', i ->> 'kind', 'result', i ->> 'result'))
      from jsonb_array_elements(case when jsonb_typeof(a.data -> 'ivs') = 'array' then a.data -> 'ivs' else '[]'::jsonb end) i), '[]'::jsonb),
    'offer', case when (a.data -> 'offer' ->> 'status') in ('SENT', 'ACCEPTED', 'DECLINED')
      then jsonb_build_object('status', a.data -> 'offer' ->> 'status', 'rate', a.data -> 'offer' -> 'rate', 'start', a.data -> 'offer' ->> 'start', 'payType', j.data ->> 'payType') end,
    'reqs', coalesce(a.data -> 'reqs', '{}'::jsonb), 'portal', coalesce(a.data -> 'portal', '{}'::jsonb)) order by a.data ->> 'applied' desc), '[]'::jsonb)
  from public.hr_docs a left join public.hr_docs j on j.path = 'jobs/' || (a.data ->> 'jobId') left join public.hr_docs p on p.path = 'projects/' || (j.data ->> 'projectId')
  where a.col = 'applicants' and auth.uid() is not null and a.data ->> 'portalUid' = auth.uid()::text
$$;

-- The applicant sends a requirement (file and/or number), a signed copy of a document HR shared, or withdraws.
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

revoke execute on function public.hr_careers(), public.hr_portal_link(), public.hr_apply(text, jsonb), public.hr_my_apps(), public.hr_portal_put(text, text, text, jsonb) from public;
revoke execute on function public.hr_portal_link(), public.hr_apply(text, jsonb), public.hr_my_apps(), public.hr_portal_put(text, text, text, jsonb) from anon;
grant execute on function public.hr_careers() to anon, authenticated;
grant execute on function public.hr_portal_link(), public.hr_apply(text, jsonb), public.hr_my_apps(), public.hr_portal_put(text, text, text, jsonb) to authenticated;

-- Files: applicants upload only into their own folder apply/<their id>/; they can read their own uploads (owner),
-- the forms HR publishes under forms/, and the documents HR shares with them under share/<their id>/.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hr_files_apply_insert') then
    create policy hr_files_apply_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'hr-files' and name like 'apply/' || auth.uid()::text || '/%');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hr_files_portal_read') then
    create policy hr_files_portal_read on storage.objects for select to authenticated
      using (bucket_id = 'hr-files' and (name like 'forms/%' or name like 'share/' || auth.uid()::text || '/%'));
  end if;
end $$;
