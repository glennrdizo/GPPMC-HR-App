-- Hiring to onboarding (Glenn 2026-10-20: full automation). The applicant accepts or declines a job offer on the careers page.
-- Only the applicant's own application, only while HR's offer is marked sent, and only the offer status changes.
-- Create-only statements (no DROP), so it can run through the Supabase connector.
create or replace function public.hr_offer_respond(p_app text, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); path_ text := 'applicants/' || coalesce(p_app, ''); a jsonb; st text := case when p_accept then 'ACCEPTED' else 'DECLINED' end;
  today text := to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(p_app, '') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select data into a from public.hr_docs where path = path_ for update;
  if a is null or a ->> 'portalUid' is distinct from uid::text then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(a ->> 'stage', '') in ('HIRED', 'REJECTED', 'WITHDRAWN') then raise exception 'application_closed'; end if;
  if (a -> 'offer' ->> 'status') is distinct from 'SENT' then raise exception 'no_offer'; end if;
  update public.hr_docs set data = data
      || jsonb_build_object('offer', (data -> 'offer') || jsonb_build_object('status', st, 'respondedAt', now(), 'via', 'careers'))
      || case when jsonb_typeof(data -> 'olr') = 'object' then jsonb_build_object('olr', (data -> 'olr') || jsonb_build_object('status', st, lower(st), today)) else '{}'::jsonb end
    where path = path_;
end $$;
revoke execute on function public.hr_offer_respond(text, boolean) from public, anon;
grant execute on function public.hr_offer_respond(text, boolean) to authenticated;
