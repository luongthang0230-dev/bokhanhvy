-- Cho phép 1 tài khoản đăng nhập đồng thời 1 máy PC + 1 máy Android (mỗi nền tảng 1 phiên).
alter table public.auto_sessions add column if not exists platform text not null default 'pc'
  check (platform in ('pc','android'));
alter table public.auto_sessions drop constraint if exists auto_sessions_pkey;
alter table public.auto_sessions add primary key (member_id, platform);

drop function if exists public.auto_acquire_session(uuid, text, text, text, int);
drop function if exists public.auto_check_session(uuid, text, text, text, int);

create or replace function public.auto_acquire_session(
  p_member uuid, p_device text, p_host text, p_ver text, p_ttl int, p_platform text default 'pc'
) returns text language plpgsql security definer set search_path = public as $$
declare r public.auto_sessions;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text || ':' || p_platform));
  select * into r from public.auto_sessions where member_id = p_member and platform = p_platform;
  if found and r.device <> p_device and not r.released
     and r.hb > now() - make_interval(secs => p_ttl) then
    return 'busy';
  end if;
  insert into public.auto_sessions (member_id, platform, device, host, ver, at, hb, released)
  values (p_member, p_platform, p_device, p_host, p_ver, now(), now(), false)
  on conflict (member_id, platform) do update
    set device = excluded.device, host = excluded.host, ver = excluded.ver,
        at = now(), hb = now(), released = false;
  return 'ok';
end; $$;

create or replace function public.auto_check_session(
  p_member uuid, p_device text, p_host text, p_ver text, p_hb_every int, p_platform text default 'pc'
) returns text language plpgsql security definer set search_path = public as $$
declare r public.auto_sessions;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text || ':' || p_platform));
  select * into r from public.auto_sessions where member_id = p_member and platform = p_platform;
  if not found then
    insert into public.auto_sessions (member_id, platform, device, host, ver)
    values (p_member, p_platform, p_device, p_host, p_ver);
    return 'ok';
  end if;
  if r.device <> p_device then
    return 'kicked';
  end if;
  if r.released or r.hb < now() - make_interval(secs => p_hb_every) then
    update public.auto_sessions set hb = now(), released = false, host = p_host, ver = p_ver
    where member_id = p_member and platform = p_platform;
  end if;
  return 'ok';
end; $$;

revoke all on function public.auto_acquire_session(uuid, text, text, text, int, text) from public, anon, authenticated;
revoke all on function public.auto_check_session(uuid, text, text, text, int, text)   from public, anon, authenticated;
grant execute on function public.auto_acquire_session(uuid, text, text, text, int, text) to service_role;
grant execute on function public.auto_check_session(uuid, text, text, text, int, text)   to service_role;
