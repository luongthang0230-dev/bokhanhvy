-- ============================================================================
-- Cấu hình cho app "CPK Filter Tool" (tài khoản desktop) - hiện chỉ có 1 cờ:
-- registration_enabled, dùng để admin BẬT/TẮT tính năng đăng ký tài khoản mới
-- từ trong app desktop (yêu cầu: "chỉ cho phép đăng ký tài khoản mới khi tính
-- năng này được bật").
--
-- Bảng dùng chung dạng key-value đơn giản để dễ mở rộng thêm cờ khác sau này
-- mà không cần thêm migration mới mỗi lần.
-- ============================================================================

create table public.cpk_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cpk_settings enable row level security;

-- Đọc/ghi thực tế luôn đi qua server (supabaseAdmin, service role, bỏ qua RLS) - xem
-- src/lib/cpk-auth-core.ts. Policy dưới đây chỉ để phòng hờ nếu sau này có nơi khác
-- (client, admin dashboard) cần đọc/ghi trực tiếp bằng phiên đăng nhập admin.
create policy "admin full access cpk_settings" on public.cpk_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

grant select on public.cpk_settings to authenticated;
grant all on public.cpk_settings to service_role;

insert into public.cpk_settings (key, value) values ('registration_enabled', 'true'::jsonb);
