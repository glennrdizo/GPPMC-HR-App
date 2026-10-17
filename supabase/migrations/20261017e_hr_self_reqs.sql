-- Requests employees send from their own account on the website (Glenn 2026-10-17: leave, attendance change, overtime,
-- certificate, change to my record, resignation notice): the phone write guard from 20261017_hr_audit5.sql also allows
-- clockins/<uid>/reqs/<id>. Once HR's app has filed a request (done = true) the employee can't change it.
-- Same function otherwise.
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
  if rest !~ '^(days|fixes|decide|loans|loanfiles|tickets|reqs)/[^/]+$' then raise exception 'Not allowed here' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then
    if sub = 'days' then raise exception 'Time records can''t be deleted' using errcode = '42501'; end if;
    return old;
  end if;
  if octet_length(new.data::text) > 400000 then raise exception 'Too large' using errcode = '54000'; end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = regexp_replace(new.path, '/[^/]+$', '');
    if n >= 5000 then raise exception 'Too many records' using errcode = '54000'; end if;
  end if;
  if sub in ('fixes', 'decide', 'reqs') and tg_op = 'UPDATE' and (old.data ->> 'done') = 'true' then
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
