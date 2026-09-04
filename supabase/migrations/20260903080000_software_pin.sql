-- ============================================================================
-- Tính năng "Ghim phần mềm" — phần mềm được ghim luôn nằm trên cùng, bất kể
-- đang xếp theo Mặc định / Phổ biến (lượt tải) / Mới nhất, không bị phần mềm
-- khác chen lên trước. Việc sắp xếp ưu tiên ghim được xử lý ở phía ứng dụng
-- (softwareQuery), cột này chỉ đánh dấu true/false.
-- ============================================================================

alter table public.software add column if not exists is_pinned boolean not null default false;
