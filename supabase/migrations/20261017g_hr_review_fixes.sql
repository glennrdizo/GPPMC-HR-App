-- Backend and database review 2026-10-17 (evening), on top of 20261017f.
-- B1  hr_merge in one pass (an employee's large patch could hold a database connection for seconds); hr_update caps patch size
--     and refuses non-object patches.
-- B2  hr_set_editor: only an Owner can switch Owners, Executives or HR Managers on or off.
-- B11 employees can't delete requests HR has already processed; B12 caps count records created today (HR closing old
--     requests no longer uses up the employee's allowance), employee writes can't set HR's claim, hr_take tolerates a bad
--     claim time, the file store no longer accepts "any type" labels.
-- DB1 indexes for the employee data function and dated reads; DB3 unique employee number and structural checks;
-- DB6 hr_events keeps only the employee ids of a pay run, not everyone's amounts; DB9 signed-in users lose table rights
--     the app never uses (all writes to these tables go through definer functions).

-- created_at: set once when a record is created (existing records stay empty, so they never count as "today")
alter table public.hr_docs add column if not exists created_at timestamptz;
alter table public.hr_docs alter column created_at set default now();

create or replace function public.hr_merge(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(coalesce(a, '{}'::jsonb)) <> 'object' or jsonb_typeof(b) <> 'object' then b else
    (select coalesce(jsonb_object_agg(k, case when b ? k then
        case when jsonb_typeof(b -> k) = 'object' and jsonb_typeof(a -> k) = 'object' then public.hr_merge(a -> k, b -> k) else b -> k end
      else a -> k end), '{}'::jsonb)
     from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) k union select jsonb_object_keys(b)) s) end
$$;
create or replace function public.hr_update(p text, patch jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  if jsonb_typeof(patch) is distinct from 'object' then raise exception 'bad_patch' using errcode = '22023'; end if;
  if octet_length(patch::text) > 1000000 then raise exception 'Too large' using errcode = '54000'; end if;
  update public.hr_docs set data = public.hr_merge(data, patch) where path = p returning version into v;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function public.hr_set_editor(target uuid, allow boolean) returns void
language plpgsql security definer set search_path = public as $$
declare trole text := (select data -> 'users' -> (target::text) ->> 'role' from public.hr_docs where path = 'org/access');
begin
  if not public.hr_is_admin() then raise exception 'not_granted' using errcode = '42501'; end if;
  if (trole in ('owner', 'exec', 'admin') or exists (select 1 from public.hr_editors where user_id = target and is_owner)) and not public.hr_can_grant() then
    raise exception 'Only an Owner can switch Owners, Executives or HR Managers on or off' using errcode = '42501';
  end if;
  if allow then
    insert into public.hr_editors (user_id, email) select p.user_id, p.email from public.hr_profiles p where p.user_id = target
      on conflict (user_id) do update set revoked = false;
  else
    update public.hr_editors set revoked = true where user_id = target and not is_owner;
  end if;
end $$;

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
    if sub in ('fixes', 'decide', 'reqs', 'loans', 'loanfiles') and (old.data ->> 'done') = 'true' then
      raise exception 'Already processed' using errcode = '42501'; end if;
    return old;
  end if;
  -- HR's claim on a record (hr_take) is HR's to write: an employee's copy is dropped and HR's kept.
  new.data := new.data - 'claim';
  if tg_op = 'UPDATE' and (old.data ? 'claim') then new.data := new.data || jsonb_build_object('claim', old.data -> 'claim'); end if;
  if octet_length(new.data::text) > 400000 then raise exception 'Too large' using errcode = '54000'; end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = regexp_replace(new.path, '/[^/]+$', '');
    if n >= 5000 then raise exception 'Too many records' using errcode = '54000'; end if;
  end if;
  -- daily caps on what an employee's account can add (audit 2026-10-17 S1/S4): counted on when records were created
  if tg_op = 'INSERT' and sub in ('reqs', 'loans', 'loanfiles', 'tickets') and not exists (select 1 from public.hr_docs where path = new.path) then
    select count(*) into n from public.hr_docs where col = base || '/' || sub and created_at > now() - interval '1 day';
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

create or replace function public.hr_take(p text, tab text) returns boolean
language sql security invoker set search_path = public as $$
  with u as (
    update public.hr_docs set data = data || jsonb_build_object('claim', jsonb_build_object('by', left(tab, 80), 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
     where path = p and p like 'clockins/%' and public.hr_is_editor() and coalesce(data->>'done', 'false') <> 'true'
       and (data->'claim' is null or data->'claim'->>'by' = left(tab, 80)
            or not pg_input_is_valid(data->'claim'->>'at', 'timestamptz')
            or (case when pg_input_is_valid(data->'claim'->>'at', 'timestamptz') then (data->'claim'->>'at')::timestamptz end) < now() - interval '60 seconds')
    returning 1)
  select exists (select 1 from u);
$$;

update storage.buckets set allowed_mime_types = array_remove(array_remove(allowed_mime_types, 'application/octet-stream'), 'application/json')
  where id = 'hr-files';

create index if not exists hr_docs_my_day_idx on public.hr_docs ((coalesce(data->>'d', '')), col) where col like 'clockins/%/days';
create index if not exists hr_docs_my_d_idx on public.hr_docs (col, (coalesce(data->>'d', ''))) where col in ('punchrev', 'suspend');
create index if not exists hr_docs_my_start_idx on public.hr_docs (col, (coalesce(data->>'start', ''))) where col in ('payruns', 'periods');
create index if not exists hr_docs_empid_idx on public.hr_docs (col, (data->>'empId'));
create index if not exists hr_docs_q_day_idx on public.hr_docs (col, (data->'d')) where col like 'clockins/%/days';
create index if not exists hr_docs_created_idx on public.hr_docs (col, created_at) where col like 'clockins/%';

create unique index if not exists hr_docs_emp_no_uq on public.hr_docs (lower(data->>'no')) where col = 'employees' and coalesce(data->>'no', '') <> '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hr_docs_col_matches_path') then
    alter table public.hr_docs add constraint hr_docs_col_matches_path check (col = regexp_replace(path, '/[^/]+$', '')); end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_docs_data_object') then
    alter table public.hr_docs add constraint hr_docs_data_object check (jsonb_typeof(data) = 'object'); end if;
end $$;

create or replace function public.hr_docs_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if new.col in ('leaves', 'leavereq', 'otreqs', 'attreq', 'flex', 'reimb', 'empchg', 'certreq', 'resign', 'payruns', 'applicants')
     and array_length(string_to_array(new.path, '/'), 1) = 2
     and (tg_op = 'INSERT' or old.data is distinct from new.data) then
    o := case when tg_op = 'UPDATE' then old.data end; n := new.data;
    if new.col = 'payruns' then -- the notice job only needs who is on the pay run, not the amounts
      n := jsonb_set(n - 'lines', '{lines}', coalesce((select jsonb_object_agg(k, true) from jsonb_object_keys(case when jsonb_typeof(new.data->'lines') = 'object' then new.data->'lines' else '{}' end) k), '{}'));
      if o is not null then
        o := jsonb_set(o - 'lines', '{lines}', coalesce((select jsonb_object_agg(k, true) from jsonb_object_keys(case when jsonb_typeof(old.data->'lines') = 'object' then old.data->'lines' else '{}' end) k), '{}'));
        if o = n then return null; end if;
      end if;
    end if;
    begin
      insert into public.hr_events (path, col, old, new) values (new.path, new.col, o, n);
    exception when others then null;
    end;
  end if;
  return null;
end $$;
revoke execute on function public.hr_docs_event() from anon, public, authenticated;

revoke truncate, trigger, references on public.hr_docs, public.hr_editors, public.hr_profiles, public.hr_signups, public.hr_owner_emails from authenticated;
revoke insert, update, delete on public.hr_editors, public.hr_profiles, public.hr_signups, public.hr_owner_emails from authenticated;
revoke select on public.hr_owner_emails from authenticated;
