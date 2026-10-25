-- Audit 2026-10-25 (report: hr-system-app/audit-2026-10-25.md). Create-only; no data is changed.
--   A. B1  Account links (org/clocklinks): only HR Admins, Owners, Executives or Payroll may link an HR staff account to an
--          employee. Otherwise a Timekeeper could link their own account to anyone and read that person's pay and bank
--          details and payslips through hr_my_data. Removing links and linking employee accounts stay open to all HR roles.
--   B. B2  Stored files: "No access" accounts stop reading files (same rule as records, hr_is_staff()).
--   C. B6  created_at is set by the database, so employees can't backdate their own records past the daily caps.
--   D. B9  Audit log listing uses the time index; B10 indexes for applicant lookups by account and job.

-- ===================== A. account links =====================
create or replace function public.hr_links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare oldl jsonb; k text; v text;
begin
  if auth.uid() is null or new.path is distinct from 'org/clocklinks' then return new; end if;
  if public.hr_is_admin() or public.hr_can_pay() then return new; end if;
  oldl := case when tg_op = 'UPDATE' then coalesce(old.data -> 'links', '{}'::jsonb) else '{}'::jsonb end;
  for k, v in select * from jsonb_each_text(coalesce(new.data -> 'links', '{}'::jsonb)) loop
    if (oldl ->> k) is distinct from v and exists (select 1 from public.hr_editors e where e.user_id::text = k) then
      raise exception 'Only an HR Admin or Payroll can link an HR staff account to an employee' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.hr_links_guard() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_links_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_links_guard before insert or update on public.hr_docs for each row execute function public.hr_links_guard();
  end if;
end $$;

-- ===================== B. stored files =====================
alter policy hr_files_read on storage.objects using (bucket_id = 'hr-files' and ((select public.hr_is_staff()) or owner = (select auth.uid())));

-- ===================== C. created_at =====================
create or replace function public.hr_docs_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  return new;
end $$;
revoke execute on function public.hr_docs_created() from anon, public, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_created' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_created before insert or update on public.hr_docs for each row execute function public.hr_docs_created();
  end if;
end $$;

-- ===================== D. audit list and applicant indexes =====================
create or replace function public.hr_audit_list(p_from date, p_to date)
returns table (at timestamptz, uid uuid, name text, op text, path text, keys text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_can_audit() then raise exception 'not_granted' using errcode = '42501'; end if;
  return query
    select l.at, l.uid, coalesce(nullif(pr.name, ''), pr.email), l.op, l.path, l.keys
    from public.hr_audit_log l left join public.hr_profiles pr on pr.user_id = l.uid
    where l.at >= (p_from::timestamp at time zone 'Asia/Manila') and l.at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    order by l.at desc limit 5000;
end $$;
revoke execute on function public.hr_audit_list(date, date) from anon, public;
grant execute on function public.hr_audit_list(date, date) to authenticated;

create index if not exists hr_docs_app_portal_idx on public.hr_docs ((data ->> 'portalUid')) where col = 'applicants';
create index if not exists hr_docs_app_job_idx on public.hr_docs ((data ->> 'jobId')) where col = 'applicants';
