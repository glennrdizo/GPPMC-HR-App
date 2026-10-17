-- Year-to-date totals on My payslips (Glenn 2026-10-17): hr_my_data() also returns this year's payslips.
-- Same function as 20261017c_hr_my_data.sql otherwise.
-- Employee pages that stay current without an HR browser open (Glenn 2026-10-17).
-- hr_my_data() hands a signed-in employee ONLY their own slice of HR's records, so their account can build the
-- Employee pages itself. Deny by default: an approved account whose user id is linked (org/clocklinks) to an active
-- employee gets that employee's record and the rows that name them; everything else is left out or cut down to them.
-- Confidential employees' pay is already kept apart in conf/ (never read here), and their payslips are not returned.
create or replace function public.hr_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  me text;
  e jsonb;
  devs text[];
  prj text;
  dept text;
  is_conf boolean;
  since text := to_char((now() at time zone 'Asia/Manila')::date - 75, 'YYYY-MM-DD');
  out jsonb := '[]'::jsonb;
begin
  if u is null or not public.hr_is_approved() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select d.data->'links'->>u::text into me from public.hr_docs d where d.path = 'org/clocklinks';
  if me is null or me !~ '^[A-Za-z0-9_-]{1,80}$' then return null; end if;
  select d.data into e from public.hr_docs d where d.path = 'employees/' || me;
  if e is null or jsonb_typeof(e->'separated') = 'object' then return null; end if;
  is_conf := coalesce((e->>'conf')::boolean, false);
  prj := nullif(e->>'projectId', '');
  dept := nullif(e->>'deptId', '');
  -- every account linked to this employee (the employee's own phones)
  select coalesce(array_agg(l.key), '{}') into devs
    from public.hr_docs d, jsonb_each_text(d.data->'links') l where d.path = 'org/clocklinks' and l.value = me;

  -- the employee, their supervisor's name, the company structure and their project
  out := out || jsonb_build_array(jsonb_build_object('path', 'employees/' || me, 'data', e));
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data',
           jsonb_build_object('first', d.data->'first', 'last', d.data->'last', 'middle', d.data->'middle', 'suffix', d.data->'suffix', 'posId', d.data->'posId', 'status', d.data->'status')))
         from public.hr_docs d where d.path = 'employees/' || (e->>'supervisorId') and d.path <> 'employees/' || me), '[]');
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', d.data))
         from public.hr_docs d where d.path in ('org/main', 'org/settings') or (prj is not null and d.path = 'projects/' || prj)), '[]');
  out := out || jsonb_build_array(jsonb_build_object('path', 'org/clocklinks', 'data',
           jsonb_build_object('links', coalesce((select jsonb_object_agg(x, me) from unnest(devs) x), '{}'))));

  -- leave months: only this employee's leaves
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', jsonb_build_object('month', d.data->'month', 'items',
           coalesce((select jsonb_object_agg(i.key, i.value) from jsonb_each(case when jsonb_typeof(d.data->'items') = 'object' then d.data->'items' else '{}' end) i where i.value->>'empId' = me), '{}'))))
         from public.hr_docs d where d.col = 'leaves' and coalesce(d.data->>'month', '') >= left(since, 7)), '[]');

  -- requests and records that name this employee
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', d.data))
         from public.hr_docs d where d.col in ('attreq', 'otreqs', 'certreq', 'empchg', 'reimb', 'leavereq', 'loans', 'flex', 'paf', 'resign', 'salinc', 'offboard', 'orient')
           and d.data->>'empId' = me), '[]');

  -- work suspensions apply to everyone (who decided it stays out)
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', d.data - 'by'))
         from public.hr_docs d where d.col = 'suspend' and coalesce(d.data->>'to', d.data->>'from', '') >= since), '[]');

  -- schedules: this employee's days only
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', jsonb_build_object('m', d.data->'m', 'days',
           case when d.data->'days' ? me then jsonb_build_object(me, d.data->'days'->me) else '{}' end)))
         from public.hr_docs d where d.col = 'roster' and split_part(d.path, '/', 2) >= left(since, 7)), '[]');

  -- announcements meant for everyone, their office/project/department, or a place (the page checks places itself)
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', d.data - 'by'))
         from public.hr_docs d where d.col = 'announcements' and (
           coalesce(d.data->>'aud', 'all') = 'all'
           or (d.data->>'aud' = 'ho' and prj is null) or (d.data->>'aud' = 'prj' and prj is not null)
           or (prj is not null and d.data->>'aud' = 'p:' || prj) or (dept is not null and d.data->>'aud' = 'd:' || dept)
           or split_part(d.data->>'aud', ':', 1) in ('loc', 'pc', 'pn'))), '[]');

  -- training: each course with only this employee's record
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', (d.data - 'recs') || jsonb_build_object('recs', jsonb_build_object(me, d.data->'recs'->me))))
         from public.hr_docs d where d.col = 'courses' and d.data->'recs' ? me), '[]');

  -- time sheets: recent pay periods with only this employee's row
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', jsonb_build_object('start', d.data->'start', 'end', d.data->'end', 'status', d.data->'status', 'finalAt', d.data->'finalAt',
           'rows', case when d.data->'rows' ? me then jsonb_build_object(me, d.data->'rows'->me) else '{}' end)))
         from public.hr_docs d where d.col = 'periods' and coalesce(d.data->>'start', '') >= since), '[]');

  -- payslips: finalized pay runs with only this employee's line (none for confidential pay): the latest 6 and every one
  -- this year, so My payslips can show year-to-date totals (the me/ytd marker tells the page the year is complete)
  if not is_conf then
    out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', jsonb_build_object('start', d.data->'start', 'end', d.data->'end', 'at', d.data->'at', 'status', d.data->'status',
             'lines', jsonb_build_object(me, d.data->'lines'->me))))
           from (select * from public.hr_docs x where x.col = 'payruns' and x.data->'lines' ? me
                   and (coalesce(x.data->>'start', '') >= to_char(date_trunc('year', now() at time zone 'Asia/Manila'), 'YYYY-MM-DD')
                        or x.path in (select y.path from public.hr_docs y where y.col = 'payruns' and y.data->'lines' ? me order by y.data->>'start' desc limit 6))
                 order by x.data->>'start' desc limit 40) d), '[]');
    out := out || jsonb_build_array(jsonb_build_object('path', 'me/ytd', 'data', jsonb_build_object('year', to_char(now() at time zone 'Asia/Manila', 'YYYY'))));
  end if;

  -- time punches: the employee's own phones in full, and HR's devices (kiosks, biometrics, HR adjustments) cut down
  -- to this employee's punches; photos stay out
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', d.path, 'data', d.data))
         from public.hr_docs d where d.col = 'clockins' and (split_part(d.path, '/', 2) = any(devs)
           or split_part(d.path, '/', 2) in ('biometric', 'adjust') or split_part(d.path, '/', 2) like 'kiosk-%')), '[]');
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', s.path, 'data', jsonb_build_object('d', s.data->'d', 'dev', s.data->'dev', 'punches', s.p)))
         from (select d.path, d.data, (select coalesce(jsonb_object_agg(p.key, p.value - 'photo'), '{}') from jsonb_each(case when jsonb_typeof(d.data->'punches') = 'object' then d.data->'punches' else '{}' end) p
                 where split_part(d.col, '/', 2) = any(devs) or p.value->>'empId' = me) p
               from public.hr_docs d where d.col like 'clockins/%/days' and coalesce(d.data->>'d', '') >= since
                 and (split_part(d.col, '/', 2) = any(devs) or split_part(d.col, '/', 2) in ('biometric', 'adjust') or split_part(d.col, '/', 2) like 'kiosk-%')) s
         where s.p <> '{}'), '[]');
  -- HR's decisions on those punches
  out := out || coalesce((select jsonb_agg(jsonb_build_object('path', r.path, 'data', r.data - 'by'))
         from public.hr_docs r where r.col = 'punchrev' and coalesce(r.data->>'d', '') >= since and (r.data->>'dev' = any(devs)
           or exists (select 1 from public.hr_docs d where d.path = 'clockins/' || (r.data->>'dev') || '/days/' || (r.data->>'d')
                        and d.data->'punches'->(r.data->>'id')->>'empId' = me))), '[]');
  return out;
end;
$$;
revoke execute on function public.hr_my_data() from anon, public;
grant execute on function public.hr_my_data() to authenticated;
