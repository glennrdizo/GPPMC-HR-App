-- Security audit 2026-10-14 #3 (M1, H1): the new HRD registers.
-- * Employee relations, discipline and HR risk registers (functions 16, 17, 30 and property function 37) hold grievances,
--   hearings and incident notes. Only HR Admins, Owners, Executives, View only, and Custom or saved roles that include the
--   Compliance module (or the Admin cases page) may read them. Other roles (Timekeeper, Payroll, Recruitment) no longer can.
-- * Register record ids may only be letters, digits, "-" and "_" so a crafted id can't carry page code.
-- Create-only statements (no DROP), so it can run through the Supabase connector.

create or replace function public.hr_can_er() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hr_is_editor() and (public.hr_is_admin() or public.hr_role() = 'viewer' or exists (
    select 1 from public.hr_docs a where a.path = 'org/access' and (
      (public.hr_role() = 'custom' and (
        coalesce(a.data -> 'users' -> (auth.uid()::text) -> 'mods', '[]'::jsonb) ? 'Compliance'
        or coalesce(a.data -> 'users' -> (auth.uid()::text) -> 'views', '[]'::jsonb) ? 'discipline'))
      or coalesce(a.data -> 'roles' -> public.hr_role() -> 'views', '[]'::jsonb) ? 'discipline')))
$$;
revoke execute on function public.hr_can_er() from anon, public;
grant execute on function public.hr_can_er() to authenticated;

alter policy hr_docs_read on public.hr_docs
  using ((public.hr_is_editor() or (public.hr_is_approved() and (public.hr_is_self(path) or path like 'pub/%')))
    and (path not like 'conf/%' or public.hr_can_conf())
    and (col <> 'hrdreg' or coalesce(data ->> 'reg', '') !~ '^hrdr?_(16|17|30|37)(_|$)' or public.hr_can_er()));

create or replace function public.hr_docs_id_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.path like 'hrdreg/%' and split_part(new.path, '/', 2) !~ '^[A-Za-z0-9_-]{1,60}$' then
    raise exception 'Bad record id' using errcode = '22023';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_docs_id_guard' and tgrelid = 'public.hr_docs'::regclass) then
    create trigger hr_docs_id_guard before insert or update on public.hr_docs for each row execute function public.hr_docs_id_guard();
  end if;
end $$;
