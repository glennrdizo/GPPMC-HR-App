-- System audit 2026-10-17 (S1/S4): daily caps on what an employee's account can add (requests 30, loan posts 10,
-- loan document parts 120, Ask HR tickets 30 a day), and only safe file types in the hr-files bucket (S2).
-- Phone write guard otherwise the same as 20261017e_hr_self_reqs.sql.
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
  -- daily caps on what an employee's account can add (audit 2026-10-17 S1/S4): counted on the server's updated_at
  if tg_op = 'INSERT' and sub in ('reqs', 'loans', 'loanfiles', 'tickets') then
    select count(*) into n from public.hr_docs where col = base || '/' || sub and updated_at > now() - interval '1 day';
    if n >= (case sub when 'reqs' then 30 when 'loans' then 10 when 'loanfiles' then 120 else 30 end) then
      raise exception 'Too many today. Try again tomorrow or ask HR.' using errcode = '54000';
    end if;
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

-- S2: only photos, PDFs, video/audio, text/CSV and Office files can be uploaded to the app's file store
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
  'application/pdf','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/webm','text/plain','text/csv','text/markdown',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','application/x-zip-compressed']
  where id = 'hr-files';
