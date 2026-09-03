-- Rebrand site settings from "DevKho" to "Lương Thắng" and update the footer copy.
update public.site_settings
set data = data
  || jsonb_build_object(
    'siteName', 'Lương Thắng',
    'footerText', '© 2026 Lương Thắng - Cho đi là mất sạch.',
    'aboutTitle', 'Về Lương Thắng',
    'seoTitle', 'Lương Thắng — Kho phần mềm & công cụ tuyển chọn'
  )
where id = 'main';
