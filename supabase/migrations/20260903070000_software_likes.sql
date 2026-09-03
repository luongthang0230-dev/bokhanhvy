-- ============================================================================
-- Tính năng "Thả tim" cho phần mềm — không cần đăng nhập, giống cơ chế
-- register_download() đã có sẵn: mọi người có thể tăng/giảm số tim qua
-- 1 function an toàn (không được sửa trực tiếp cột likes).
-- ============================================================================

alter table public.software add column if not exists likes integer not null default 0;

create or replace function public.set_software_like(_software_id uuid, _liked boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  new_count integer;
begin
  if _liked then
    update public.software set likes = likes + 1 where id = _software_id returning likes into new_count;
  else
    update public.software set likes = greatest(likes - 1, 0) where id = _software_id returning likes into new_count;
  end if;
  return new_count;
end; $$;
revoke all on function public.set_software_like(uuid, boolean) from public;
grant execute on function public.set_software_like(uuid, boolean) to anon, authenticated;
