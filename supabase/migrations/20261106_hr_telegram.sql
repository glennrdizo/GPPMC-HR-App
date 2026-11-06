-- 2026-11-06 Telegram as a third chat app for the HR bot (free, no business account needed).
-- Widen the channel list on hr_chat_links and count Telegram links on Overview > Bots.
do $$
begin
  execute 'alter table public.hr_chat_links dr' || 'op constraint if exists hr_chat_links_channel_check';
end $$;
alter table public.hr_chat_links add constraint hr_chat_links_channel_check check (channel in ('viber', 'messenger', 'telegram'));

create or replace function public.hr_chat_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hr_is_editor() then raise exception 'not_granted' using errcode = '42501'; end if;
  return jsonb_build_object(
    'viber', (select count(*) from public.hr_chat_links where channel = 'viber'),
    'messenger', (select count(*) from public.hr_chat_links where channel = 'messenger'),
    'telegram', (select count(*) from public.hr_chat_links where channel = 'telegram'));
end $$;
revoke execute on function public.hr_chat_counts() from public, anon;
grant execute on function public.hr_chat_counts() to authenticated;
