-- AI screening (Glenn 2026-10-20): the careers page shows each job's qualification questions and the applicant answers them when
-- applying; the server job (hr-jobs) then reads the resume and answers and records a recommendation for HR on the applicant (ai).
-- Changing an application while it is still "Applied" clears the old recommendation so it is worked out again.
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
        'location', coalesce(p.data ->> 'location', t.data ->> 'hoAddress', 'Head Office'),
        'questions', case when jsonb_typeof(j.data -> 'questions') = 'array' then j.data -> 'questions' end) order by j.data ->> 'opened' desc)
      from public.hr_docs j left join public.hr_docs p on p.path = 'projects/' || (j.data ->> 'projectId')
      where j.col = 'jobs' and j.data ->> 'status' = 'OPEN' and coalesce(j.data ->> 'sample', 'false') <> 'true' and coalesce(j.data ->> 'careersHide', 'false') <> 'true'), '[]'::jsonb))
  from (select 1) x left join public.hr_docs t on t.path = 'org/talent'
$$;

create or replace function public.hr_apply(p_job text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; ok timestamptz; j jsonb; cur_path text; cur jsonb; aid text; d jsonb; res jsonb; src text; n integer; ans jsonb;
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
  -- answers to the job's qualification questions: up to 12, text only
  if jsonb_typeof(p -> 'answers') = 'object' then
    select jsonb_object_agg(left(k, 300), left(trim(v), 1500)) into ans from (
      select key k, value #>> '{}' v from jsonb_each(p -> 'answers') where jsonb_typeof(value) = 'string' and trim(value #>> '{}') <> '' limit 12) s;
  end if;
  src := case lower(coalesce(p ->> 'src', '')) when 'linkedin' then 'LinkedIn' when 'facebook' then 'Facebook' when 'fb' then 'Facebook' when 'jobstreet' then 'JobStreet'
    when 'indeed' then 'Indeed' when 'referral' then 'Referral' else 'Company website' end;
  d := jsonb_build_object(
    'first', left(trim(p ->> 'first'), 60), 'middle', nullif(left(trim(coalesce(p ->> 'middle', '')), 60), ''), 'last', left(trim(p ->> 'last'), 60),
    'mobile', left(trim(p ->> 'mobile'), 30), 'email', em, 'address', nullif(left(trim(coalesce(p ->> 'address', '')), 200), ''),
    'birth', case when (p ->> 'birth') ~ '^\d{4}-\d{2}-\d{2}$' then p ->> 'birth' end, 'gender', case when (p ->> 'gender') in ('M', 'F') then p ->> 'gender' end,
    'expRate', case when (p ->> 'expRate') ~ '^\d{1,7}(\.\d{1,2})?$' then (p ->> 'expRate')::numeric end,
    'notes', nullif(left(trim(coalesce(p ->> 'notes', '')), 2000), ''));
  if res is not null then d := d || jsonb_build_object('resume', res); end if;
  if ans is not null then d := d || jsonb_build_object('answers', ans); end if;
  select path, data into cur_path, cur from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text and data ->> 'jobId' = p_job limit 1;
  if cur_path is not null then
    if cur ->> 'stage' = 'APPLIED' then update public.hr_docs set data = (data - 'ai') || d where path = cur_path; end if;
    return split_part(cur_path, '/', 2);
  end if;
  select count(*) into n from public.hr_docs where col = 'applicants' and data ->> 'portalUid' = uid::text and coalesce(data ->> 'stage', '') not in ('HIRED', 'REJECTED', 'WITHDRAWN');
  if n >= 5 then raise exception 'too_many_applications'; end if;
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
