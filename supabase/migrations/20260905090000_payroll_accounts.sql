-- ============================================================================
-- Giai đoạn 2 — Tài khoản cục bộ cho app Tính lương + dữ liệu riêng theo
-- từng tài khoản (thay cho chỉ lưu localStorage của Giai đoạn 1).
--
-- Tài khoản Tính lương DÙNG CHUNG hệ thống Supabase Auth với tài khoản
-- Admin của web (đã có sẵn), chỉ khác: đăng ký bằng "tên tài khoản" thay vì
-- email thật (email được sinh ngầm dạng "<username>@payroll.local", người
-- dùng không nhìn thấy). Vai trò admin/user đã có sẵn qua bảng
-- public.user_roles + hàm has_role() từ SETUP.sql — không cần đổi gì thêm,
-- tài khoản Tính lương mới tạo sẽ KHÔNG có quyền admin (đúng yêu cầu "User
-- không được truy cập Dashboard Admin").
-- ============================================================================

create table public.payroll_sj_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ma_sj text not null,
  config jsonb not null default '{}'::jsonb,
  ca_config jsonb not null default '{}'::jsonb,
  timesheet jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, ma_sj)
);
alter table public.payroll_sj_records enable row level security;
create policy "owner full access sj records" on public.payroll_sj_records for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.payroll_sj_records to authenticated;
grant all on public.payroll_sj_records to service_role;

create table public.payroll_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ma_sj text not null,
  saved_at timestamptz not null default now(),
  thang integer not null,
  nam integer not null,
  input jsonb not null,
  result jsonb not null
);
alter table public.payroll_history enable row level security;
create policy "owner full access history" on public.payroll_history for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.payroll_history to authenticated;
grant all on public.payroll_history to service_role;
create index payroll_history_user_idx on public.payroll_history(user_id, ma_sj);

-- Admin xem/xoá/đặt lại mật khẩu/khoá tài khoản Tính lương: các thao tác này
-- CHẠM TỚI auth.users (không phải bảng dữ liệu thường), nên bắt buộc phải
-- chạy bằng service role ở server (không thể làm qua RLS phía trình duyệt).
-- Xem src/lib/payroll-auth-server.ts — mọi hàm admin ở đó tự kiểm tra lại
-- has_role(caller,'admin') trước khi cho thao tác, không tin phía client.
