-- THANG_LUONG_SETUP.sql — Chạy file này 1 LẦN trong SQL Editor của Supabase
-- hiện tại để bổ sung bảng Thang lương dùng chung cho toàn bộ tài khoản.

-- ============================================================================
-- Bảng "Thang lương" — admin upload 1 lần qua Excel, DÙNG CHUNG cho MỌI tài
-- khoản Tính lương (không phải dữ liệu riêng theo user_id như
-- payroll_sj_records). Dịch lại đúng schema + logic từ
-- sj_payroll/db/database.py (bảng thang_luong) + thang_luong_import.py của
-- app EXE gốc — mỗi dòng là 1 "bậc lương" với 5 mốc phụ cấp kỹ năng A-E.
-- ============================================================================

create table public.payroll_thang_luong (
  id uuid primary key default gen_random_uuid(),
  loai text not null,
  bac_luong text not null,
  lcb integer not null,
  a integer not null default 0,
  b integer not null default 0,
  c integer not null default 0,
  d integer not null default 0,
  e integer not null default 0,
  thu_tu integer not null,
  created_at timestamptz not null default now()
);
create index payroll_thang_luong_lcb_idx on public.payroll_thang_luong(lcb);

alter table public.payroll_thang_luong enable row level security;
-- Mọi tài khoản đã đăng nhập (kể cả không phải admin) đều cần ĐỌC được để
-- tra cứu ABC theo LCB mình nhập — đúng yêu cầu "để toàn bộ các tài khoản
-- đều có thể sử dụng".
create policy "authenticated can read thang luong" on public.payroll_thang_luong
  for select to authenticated using (true);
-- Chỉ admin được sửa/xoá trực tiếp (thao tác thay toàn bộ bảng nên đi qua
-- function replace_payroll_thang_luong bên dưới để đảm bảo atomic).
create policy "admin can write thang luong" on public.payroll_thang_luong
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
grant select on public.payroll_thang_luong to authenticated;
grant all on public.payroll_thang_luong to service_role;

-- Thay TOÀN BỘ bảng thang lương trong 1 transaction (giống replace_thang_luong()
-- của app gốc: xoá hết rồi chèn lại từ file Excel vừa upload) — tự kiểm tra
-- quyền admin ngay trong function, không dựa vào RLS phía client để tránh
-- race condition giữa xoá và chèn.
create or replace function public.replace_payroll_thang_luong(_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted_count integer;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Chỉ admin mới được cập nhật thang lương';
  end if;

  delete from public.payroll_thang_luong;

  insert into public.payroll_thang_luong (loai, bac_luong, lcb, a, b, c, d, e, thu_tu)
  select
    r->>'loai', r->>'bac_luong', (r->>'lcb')::integer,
    coalesce((r->>'a')::integer, 0), coalesce((r->>'b')::integer, 0),
    coalesce((r->>'c')::integer, 0), coalesce((r->>'d')::integer, 0),
    coalesce((r->>'e')::integer, 0), (r->>'thu_tu')::integer
  from jsonb_array_elements(_rows) as r;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;
revoke all on function public.replace_payroll_thang_luong(jsonb) from public;
grant execute on function public.replace_payroll_thang_luong(jsonb) to authenticated;
