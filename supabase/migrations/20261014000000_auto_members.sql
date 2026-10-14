-- ============================================================================
-- Thành viên app Desktop "Auto Vạn Kiếp Hùng Ca" (đăng ký / đăng nhập / quản lý)
-- Thay cho kho GitHub (data/users.json + sessions/*.json) mà app dùng trước đây.
--
-- Mật khẩu KHÔNG nằm trong các bảng này: tài khoản đăng nhập thật nằm trong Supabase Auth
-- (email giả <username>@auto.local, user_metadata.app = 'auto'), giống app CPK / Tính lương.
-- Mọi đọc/ghi thực tế đi qua server (service role) - xem src/lib/auto-auth-core.ts.
-- ============================================================================

create table public.auto_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,   -- null = thành viên cũ chưa chuyển sang Supabase Auth
  username text not null unique check (username = lower(username)),
  status text not null default 'trial' check (status in ('trial','active','disabled','pending')),
  expires_at timestamptz,                                           -- null = vĩnh viễn
  max_accs int not null default 2 check (max_accs >= 0),            -- 0 = không giới hạn
  deny text[] not null default '{}',                                -- tính năng bị khoá
  -- Chỉ dùng khi nhập danh sách thành viên cũ (PBKDF2 từ users.json): lần đăng nhập đầu tiên server kiểm tra rồi
  -- tạo tài khoản Supabase Auth và xoá 3 cột này.
  legacy_salt text, legacy_iter int, legacy_hash text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create index auto_members_created_idx on public.auto_members (created_at desc);

-- 1 tài khoản chỉ 1 thiết bị tại một thời điểm
create table public.auto_sessions (
  member_id uuid primary key references public.auto_members(id) on delete cascade,
  device text not null,
  host text,
  ver text,
  at timestamptz not null default now(),
  hb timestamptz not null default now(),       -- nhịp "còn sống" gần nhất
  released boolean not null default false
);

-- Mỗi máy chỉ dùng thử 1 lần (fp = dấu vân tay máy do app gửi lên) + giới hạn số lần đăng ký theo IP
create table public.auto_trials (
  fp text primary key,
  username text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index auto_trials_ip_idx on public.auto_trials (ip, created_at desc);

-- Cấu hình: registration_open (bool), contact (text)
create table public.auto_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.auto_members  enable row level security;
alter table public.auto_sessions enable row level security;
alter table public.auto_trials   enable row level security;
alter table public.auto_settings enable row level security;

create policy "admin full access auto_members"  on public.auto_members  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admin full access auto_sessions" on public.auto_sessions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admin full access auto_trials"   on public.auto_trials   for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admin full access auto_settings" on public.auto_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

grant all on public.auto_members, public.auto_sessions, public.auto_trials, public.auto_settings to service_role;

-- Mặc định ĐÓNG đăng ký (giống app cũ): admin bật trong tab "Người dùng Auto" hoặc trong app.
insert into public.auto_settings (key, value) values
  ('registration_open', 'false'::jsonb),
  ('contact', '"Zalo: 0917.969.587"'::jsonb);

-- ----------------------------------------------------------------------------
-- Giành / giữ phiên đăng nhập (nguyên tử: khoá theo thành viên nên 2 máy đăng nhập cùng lúc chỉ 1 máy được)
-- ----------------------------------------------------------------------------
create or replace function public.auto_acquire_session(
  p_member uuid, p_device text, p_host text, p_ver text, p_ttl int
) returns text language plpgsql security definer set search_path = public as $$
declare r public.auto_sessions;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select * into r from public.auto_sessions where member_id = p_member;
  if found and r.device <> p_device and not r.released
     and r.hb > now() - make_interval(secs => p_ttl) then
    return 'busy';
  end if;
  insert into public.auto_sessions (member_id, device, host, ver, at, hb, released)
  values (p_member, p_device, p_host, p_ver, now(), now(), false)
  on conflict (member_id) do update
    set device = excluded.device, host = excluded.host, ver = excluded.ver,
        at = now(), hb = now(), released = false;
  return 'ok';
end; $$;

-- Máy đang dùng gọi định kỳ: xác nhận phiên còn là của mình + ghi nhịp. 'kicked' = máy khác đã giành phiên.
create or replace function public.auto_check_session(
  p_member uuid, p_device text, p_host text, p_ver text, p_hb_every int
) returns text language plpgsql security definer set search_path = public as $$
declare r public.auto_sessions;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select * into r from public.auto_sessions where member_id = p_member;
  if not found then
    insert into public.auto_sessions (member_id, device, host, ver) values (p_member, p_device, p_host, p_ver);
    return 'ok';
  end if;
  if r.device <> p_device then
    return 'kicked';
  end if;
  if r.released or r.hb < now() - make_interval(secs => p_hb_every) then
    update public.auto_sessions set hb = now(), released = false, host = p_host, ver = p_ver where member_id = p_member;
  end if;
  return 'ok';
end; $$;

revoke all on function public.auto_acquire_session(uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.auto_check_session(uuid, text, text, text, int)   from public, anon, authenticated;
grant execute on function public.auto_acquire_session(uuid, text, text, text, int) to service_role;
grant execute on function public.auto_check_session(uuid, text, text, text, int)   to service_role;
