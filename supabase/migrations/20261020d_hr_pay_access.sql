-- Pay kept to Payroll (Glenn 2026-10-20: full automation; audit 2026-10-17 H1), so roles other than Owner can be given out.
-- Before: every HR role (Timekeeper, Training, View only, Custom) could read every employee's salary, allowance and bank
-- account, and the payroll records, through direct database calls; the menu only hid the pages.
-- * hr_can_pay(): Owners, HR Managers, Executives, and roles (or Custom users) whose pages include Payroll.
-- * An employee's pay (basic pay, allowance, voluntary Pag-IBIG, previous employer, bank and account no.) is kept apart in
--   pay/employees--<id>, readable only with hr_can_pay(). The trigger does the split on every save, so the app is unchanged:
--   the website's data layer (web/sb-shim.js) puts the two back together for people who can read pay. Someone without
--   Payroll who saves an employee can't change pay (their copy has none, and any pay they send is dropped).
--   Confidential employees keep their pay in conf/ as before; their pay/ copy is removed.
-- * Payroll records (pay runs, loans, loan postings and files, salary increases, 13th month, FlexBen, fringe benefits,
--   reimbursements, remittance packs) are readable and writable only with hr_can_pay().
-- * hr_my_data() puts the employee's own pay back for their own pages.
-- Still visible to all HR roles (noted for later): pay amounts on time sheet cutoffs (periods), personnel action forms,
-- pay lines in the 201 history and change log.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create or replace function public.hr_can_pay() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and public.hr_role() <> 'none' and (public.hr_is_admin() or exists (
    select 1 from public.hr_docs a where a.path = 'org/access' and (
      (public.hr_role() = 'custom' and coalesce(a.data -> 'users' -> (auth.uid()::text) -> 'views', '[]'::jsonb) ? 'payroll')
      or (public.hr_role() <> 'custom' and coalesce(a.data -> 'roles' -> public.hr_role() -> 'views', '[]'::jsonb) ? 'payroll'))))
$$;
revoke execute on function public.hr_can_pay() from anon, public;
grant execute on function public.hr_can_pay() to authenticated;

-- Splits pay out of employees/<id> into pay/employees--<id> on every save.
create or replace function public.hr_docs_zpay() returns trigger
language plpgsql security definer set search_path = public as $$
declare ks text[] := array['basicPay', 'allow', 'hdmfVol', 'prev', 'bank', 'bankAcct']; pp text; pick jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'DELETE' then
    if old.path like 'employees/%' then delete from public.hr_docs where path = 'pay/employees--' || split_part(old.path, '/', 2); end if;
    return old;
  end if;
  if new.path not like 'employees/%' or new.path like 'employees/%/%' then return new; end if;
  pp := 'pay/employees--' || split_part(new.path, '/', 2);
  if (new.data ->> 'conf') = 'true' then
    delete from public.hr_docs where path = pp;
    new.data := new.data - ks; return new;
  end if;
  foreach k in array ks loop if new.data ? k then pick := pick || jsonb_build_object(k, new.data -> k); end if; end loop;
  new.data := new.data - ks;
  if pick = '{}'::jsonb then return new; end if;
  if auth.uid() is not null and not public.hr_can_pay() then return new; end if; -- no Payroll: pay sent along is dropped
  insert into public.hr_docs (path, col, data) values (pp, 'pay', pick)
    on conflict (path) do update set data = public.hr_docs.data || excluded.data;
  return new;
end $$;
revoke execute on function public.hr_docs_zpay() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_zpay' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_zpay before insert or update or delete on public.hr_docs for each row execute function public.hr_docs_zpay();
  end if;
end $$;

-- Payroll records: Payroll roles only
alter policy hr_docs_read on public.hr_docs
  using (((select public.hr_is_staff()) or ((select public.hr_is_approved()) and (public.hr_is_self(path) or path like 'pub/%')))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or (select public.hr_can_pay()))
    and (col <> 'hrdreg' or coalesce(data ->> 'reg', '') !~ '^hrdr?_(16|17|30|37)(_|$)' or (select public.hr_can_er()))
    and (col <> 'audit' or (select public.hr_can_audit()) or (data ->> 'uid') = (select auth.uid())::text));
alter policy hr_docs_insert on public.hr_docs
  with check (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or (select public.hr_can_pay())));
alter policy hr_docs_update on public.hr_docs
  using (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or (select public.hr_can_pay())))
  with check (((select public.hr_can_write()) or ((select public.hr_is_editor()) and (path = 'org/access' or path like 'audit/%')) or ((select public.hr_is_approved()) and public.hr_is_self(path)))
    and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or (select public.hr_can_pay())));
alter policy hr_docs_delete on public.hr_docs
  using (((select public.hr_can_write()) or ((select public.hr_is_approved()) and public.hr_is_self(path))) and (path not like 'conf/%' or (select public.hr_can_conf()))
    and (col not in ('pay', 'payruns', 'loans', 'loanposts', 'loanfiles', 'salinc', 't13', 'flex', 'fringe', 'reimb', 'remit') or (select public.hr_can_pay())));

-- The employee's own pay for their own pages
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
  select d.data || coalesce((select p.data from public.hr_docs p where p.path = 'pay/employees--' || me), '{}'::jsonb) into e from public.hr_docs d where d.path = 'employees/' || me;
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

-- Move the pay already saved: re-saving each employee runs the split above (no one is signed in here, so it is kept).
update public.hr_docs set data = data where col = 'employees' and data ?| array['basicPay', 'allow', 'hdmfVol', 'prev', 'bank', 'bankAcct'];
