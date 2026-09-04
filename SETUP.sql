-- ============================================================================
-- SETUP.sql — Script gộp TOÀN BỘ migration + dữ liệu ban đầu cho Supabase
-- project MỚI của bạn (thay thế Lovable Cloud đã không còn truy cập được).
--
-- CÁCH DÙNG:
-- 1. Vào https://supabase.com/dashboard → tạo project mới (nếu chưa có).
-- 2. Vào project đó → SQL Editor → New query.
-- 3. Dán TOÀN BỘ nội dung file này vào → bấm Run.
-- 4. Xong, database sẽ có đủ bảng, quyền, và 2 phần mềm của bạn
--    (CPK Filter Tool, Creat Card) — chỉ cần vào trang quản trị
--    (/admin) sửa lại link Google Drive thật cho từng phần mềm.
-- ============================================================================

create extension if not exists pgcrypto;

-- ROLES
create type public.app_role as enum ('admin','editor','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;

-- CATEGORIES
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text default '',
  icon text default 'Package',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "public read categories" on public.categories for select using (true);
create policy "admin write categories" on public.categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger t_categories before update on public.categories for each row execute function public.touch_updated_at();

-- SOFTWARE
create table public.software (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text default '',
  description text default '',
  install_guide text default '',
  changelog text default '',
  icon_url text default '',
  screenshots text[] not null default '{}',
  version text default '',
  size_label text default '',
  os text default 'Windows',
  developer text default '',
  license text default 'Freeware',
  kind text not null default 'software',
  category_id uuid references public.categories(id) on delete set null,
  is_featured boolean not null default false,
  is_new boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  downloads int not null default 0,
  seo_title text default '',
  seo_description text default '',
  released_at date,
  youtube_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.software to anon;
grant select, insert, update, delete on public.software to authenticated;
grant all on public.software to service_role;
alter table public.software enable row level security;
create policy "public read software" on public.software for select using (published = true or public.has_role(auth.uid(),'admin'));
create policy "admin write software" on public.software for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger t_software before update on public.software for each row execute function public.touch_updated_at();
create index software_category_idx on public.software(category_id);

-- DOWNLOAD LINKS
create table public.download_links (
  id uuid primary key default gen_random_uuid(),
  software_id uuid not null references public.software(id) on delete cascade,
  label text not null default 'Tải xuống',
  provider text not null default 'direct',
  url text not null,
  note text default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.download_links to anon;
grant select, insert, update, delete on public.download_links to authenticated;
grant all on public.download_links to service_role;
alter table public.download_links enable row level security;
create policy "public read links" on public.download_links for select using (true);
create policy "admin write links" on public.download_links for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index dl_software_idx on public.download_links(software_id);

-- POSTS
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text default '',
  content text default '',
  cover_url text default '',
  published boolean not null default true,
  sort_order int not null default 0,
  seo_title text default '',
  seo_description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;
grant all on public.posts to service_role;
alter table public.posts enable row level security;
create policy "public read posts" on public.posts for select using (published = true or public.has_role(auth.uid(),'admin'));
create policy "admin write posts" on public.posts for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger t_posts before update on public.posts for each row execute function public.touch_updated_at();

-- BANNERS
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  subtitle text default '',
  image_url text default '',
  link_url text default '',
  cta_label text default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.banners to anon;
grant select, insert, update, delete on public.banners to authenticated;
grant all on public.banners to service_role;
alter table public.banners enable row level security;
create policy "public read banners" on public.banners for select using (true);
create policy "admin write banners" on public.banners for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- HOME SECTIONS
create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null default '',
  subtitle text default '',
  enabled boolean not null default true,
  sort_order int not null default 0
);
grant select on public.home_sections to anon;
grant select, insert, update, delete on public.home_sections to authenticated;
grant all on public.home_sections to service_role;
alter table public.home_sections enable row level security;
create policy "public read sections" on public.home_sections for select using (true);
create policy "admin write sections" on public.home_sections for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- SITE SETTINGS (single row)
create table public.site_settings (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.site_settings to anon;
grant select, insert, update on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;
create policy "public read settings" on public.site_settings for select using (true);
create policy "admin write settings" on public.site_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- DOWNLOAD EVENTS + RPC
create table public.download_events (
  id bigserial primary key,
  software_id uuid references public.software(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
grant select on public.download_events to anon, authenticated;
grant all on public.download_events to service_role;
alter table public.download_events enable row level security;
create policy "public read events" on public.download_events for select using (true);

create or replace function public.register_download(_software_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.software set downloads = downloads + 1 where id = _software_id;
  insert into public.download_events (software_id) values (_software_id);
end; $$;
revoke all on function public.register_download(uuid) from public;
grant execute on function public.register_download(uuid) to anon, authenticated;

-- ============================================================================
-- DỮ LIỆU BAN ĐẦU
-- ============================================================================

insert into public.categories (slug, name, description, icon, sort_order) values
 ('do-hoa','Đồ họa & Thiết kế','Phần mềm chỉnh sửa ảnh, video và thiết kế đồ họa','Palette',1),
 ('van-phong','Văn phòng','Bộ công cụ soạn thảo, bảng tính và trình chiếu','FileText',2),
 ('lap-trinh','Lập trình','IDE, editor và công cụ cho lập trình viên','Code2',3),
 ('bao-mat','Bảo mật','Diệt virus, tường lửa và quản lý mật khẩu','ShieldCheck',4),
 ('tien-ich','Tiện ích hệ thống','Dọn dẹp, sao lưu và tối ưu máy tính','Wrench',5),
 ('multimedia','Đa phương tiện','Trình phát nhạc, video và chuyển đổi định dạng','Music',6);

-- Hai phần mềm thật của bạn (dựng lại theo ảnh chụp trang quản trị cũ).
-- ⚠️ Link Google Drive dưới đây CHỈ LÀ CHỖ TRỐNG — vào /admin sửa lại
-- thành link Drive thật của bạn cho từng phần mềm sau khi chạy xong script này.
insert into public.software (slug,name,tagline,version,size_label,os,icon_url,published,sort_order) values
('cpk-filter-tool','CPK Filter Tool',
 'Ứng dụng Desktop đọc file Excel dữ liệu đo, tự động tính Cpk/Cp/Cpu/Cpl cho từng Item (kích thước), phân loại OK/NG, xuất báo cáo, và hỗ trợ lọc bớt Sản phẩm/Sample biến động dẫn đến NG CPK. Không làm ảnh hưởng đến dữ liệu gốc.',
 '1.0','33.7 MB','Windows','https://api.dicebear.com/9.x/shapes/svg?seed=App1',true,1),
('creat-card','Creat Card',
 'Phần mềm giúp tạo thẻ nhân viên với số lượng lớn một cách nhanh chóng theo danh sách có sẵn.',
 '1.0','102.7 MB','Windows','https://api.dicebear.com/9.x/shapes/svg?seed=App2',true,2);

insert into public.download_links (software_id,label,provider,url,sort_order)
select id, 'Google Drive', 'google-drive', 'https://drive.google.com/file/d/THAY_LINK_DRIVE_THAT_CUA_BAN', 1
from public.software;

insert into public.home_sections (key,title,subtitle,enabled,sort_order) values
('hero','Kho phần mềm & công cụ tuyển chọn','Tải nhanh, an toàn, luôn cập nhật phiên bản mới nhất',true,1),
('featured','Phần mềm nổi bật','Những phần mềm được tuyển chọn kỹ lưỡng',true,2),
('new','Mới cập nhật','Vừa được thêm hoặc cập nhật phiên bản',true,3),
('categories','Danh mục','Duyệt theo nhóm phần mềm',true,4),
('popular','Được tải nhiều','Xếp hạng theo lượt tải thực tế',true,5),
('banner','Banner','Khu vực banner tùy chỉnh',true,6),
('posts','Tài nguyên & bài viết','Hướng dẫn và mẹo hữu ích',true,7);

insert into public.site_settings (id,data) values ('main', jsonb_build_object(
  'siteName','Lương Thắng',
  'tagline','Kho phần mềm & công cụ cá nhân',
  'logoUrl','',
  'faviconUrl','/favicon.ico',
  'primaryColor','#2563eb',
  'accentColor','#0ea5e9',
  'backgroundColor','#f8fafc',
  'fontFamily','"Space Grotesk"',
  'theme','light',
  'heroTitle','Tải phần mềm sạch, nhanh và an toàn',
  'heroSubtitle','Bộ sưu tập phần mềm, công cụ và tài nguyên được tuyển chọn thủ công, luôn cập nhật phiên bản mới nhất.',
  'heroCtaLabel','Khám phá phần mềm',
  'heroCtaLink','/phan-mem',
  'heroImage','',
  'headerMenu', jsonb_build_array(
     jsonb_build_object('label','Trang chủ','href','/'),
     jsonb_build_object('label','Phần mềm','href','/phan-mem'),
     jsonb_build_object('label','Công cụ','href','/cong-cu'),
     jsonb_build_object('label','Tài nguyên','href','/tai-nguyen'),
     jsonb_build_object('label','Giới thiệu','href','/gioi-thieu')),
  'footerText','© 2026 Lương Thắng - Cho đi là mất sạch.',
  'footerLinks', jsonb_build_array(
     jsonb_build_object('label','Liên hệ','href','/gioi-thieu'),
     jsonb_build_object('label','Điều khoản','href','/gioi-thieu')),
  'aboutTitle','Về Lương Thắng',
  'aboutContent','Đây là trang cá nhân nơi mình chia sẻ những phần mềm, công cụ và tài nguyên đã dùng qua và thấy thực sự hữu ích. Mọi liên kết đều được kiểm tra trước khi đăng tải.',
  'seoTitle','Lương Thắng — Kho phần mềm & công cụ tuyển chọn',
  'seoDescription','Tải phần mềm, công cụ và tài nguyên miễn phí, an toàn, luôn cập nhật phiên bản mới nhất.',
  'seoKeywords','tải phần mềm, công cụ miễn phí, phần mềm windows, tài nguyên',
  'ogImage',''
));

-- ============================================================================
-- XONG. Tiếp theo:
-- 1. Lấy Project URL + anon/publishable key: Settings → API trong Supabase.
-- 2. Cập nhật 6 biến môi trường trên Vercel (VITE_SUPABASE_URL,
--    VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
--    và 2 biến *_PROJECT_ID nếu có) bằng giá trị của project MỚI này.
-- 3. Redeploy lại trên Vercel.
-- 4. Vào /admin/login trên trang web → "Tạo tài khoản" lần đầu → tài khoản
--    đó sẽ tự động thành admin (theo logic handle_new_user() ở trên).
-- ============================================================================
-- ============================================================================
-- Tính năng "Góp ý" (chat bong bóng, không cần đăng nhập) + Hộp thư admin
-- ============================================================================

-- Mỗi lượt chat của 1 khách là 1 "conversation". Khách không đăng nhập nên
-- không có user_id — conversation được nhận diện bằng chính uuid của nó,
-- lưu trong localStorage trình duyệt khách (giống cơ chế "share link").
create table public.feedback_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null default 'Khách',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  is_read boolean not null default false
);
grant select, insert on public.feedback_conversations to anon;
grant select, insert, update, delete on public.feedback_conversations to authenticated;
grant all on public.feedback_conversations to service_role;
alter table public.feedback_conversations enable row level security;
create policy "public read conversations" on public.feedback_conversations for select using (true);
create policy "anon create conversation" on public.feedback_conversations for insert to anon with check (true);
create policy "admin update conversations" on public.feedback_conversations for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete conversations" on public.feedback_conversations for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.feedback_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor','admin')),
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.feedback_messages to anon;
grant select, insert, update, delete on public.feedback_messages to authenticated;
grant all on public.feedback_messages to service_role;
alter table public.feedback_messages enable row level security;
create policy "public read messages" on public.feedback_messages for select using (true);
create policy "anon insert visitor messages" on public.feedback_messages for insert to anon
  with check (sender_type = 'visitor');
create policy "admin insert messages" on public.feedback_messages for insert to authenticated
  with check (sender_type = 'admin' and public.has_role(auth.uid(),'admin'));
create policy "admin delete messages" on public.feedback_messages for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));
create index feedback_messages_conversation_idx on public.feedback_messages(conversation_id);

-- Mỗi khi có tin nhắn mới: cập nhật last_message_at, và đánh dấu "chưa đọc"
-- cho admin chỉ khi người gửi là khách (tin admin tự gửi thì không tính unread).
create or replace function public.touch_feedback_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_conversations
  set last_message_at = new.created_at,
      is_read = (new.sender_type = 'admin')
  where id = new.conversation_id;
  return new;
end; $$;
revoke all on function public.touch_feedback_conversation() from public, anon, authenticated;
create trigger t_feedback_message_insert
  after insert on public.feedback_messages
  for each row execute function public.touch_feedback_conversation();

-- Bật realtime để khách và admin thấy tin nhắn mới ngay lập tức, không cần refresh.
alter publication supabase_realtime add table public.feedback_conversations;
alter publication supabase_realtime add table public.feedback_messages;
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
-- ============================================================================
-- Tính năng "Ghim phần mềm" — phần mềm được ghim luôn nằm trên cùng, bất kể
-- đang xếp theo Mặc định / Phổ biến (lượt tải) / Mới nhất, không bị phần mềm
-- khác chen lên trước. Việc sắp xếp ưu tiên ghim được xử lý ở phía ứng dụng
-- (softwareQuery), cột này chỉ đánh dấu true/false.
-- ============================================================================

alter table public.software add column if not exists is_pinned boolean not null default false;
