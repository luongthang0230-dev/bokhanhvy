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
grant execute on function public.register_download(uuid) to anon, authenticated;

-- SEED
insert into public.categories (slug, name, description, icon, sort_order) values
 ('do-hoa','Đồ họa & Thiết kế','Phần mềm chỉnh sửa ảnh, video và thiết kế đồ họa','Palette',1),
 ('van-phong','Văn phòng','Bộ công cụ soạn thảo, bảng tính và trình chiếu','FileText',2),
 ('lap-trinh','Lập trình','IDE, editor và công cụ cho lập trình viên','Code2',3),
 ('bao-mat','Bảo mật','Diệt virus, tường lửa và quản lý mật khẩu','ShieldCheck',4),
 ('tien-ich','Tiện ích hệ thống','Dọn dẹp, sao lưu và tối ưu máy tính','Wrench',5),
 ('multimedia','Đa phương tiện','Trình phát nhạc, video và chuyển đổi định dạng','Music',6);

insert into public.software (slug,name,tagline,description,install_guide,changelog,icon_url,screenshots,version,size_label,os,developer,license,kind,category_id,is_featured,is_new,downloads,sort_order,released_at) values
('photoshine-studio','PhotoShine Studio','Chỉnh sửa ảnh chuyên nghiệp, nhẹ và nhanh','PhotoShine Studio là bộ công cụ chỉnh sửa ảnh mạnh mẽ với hệ thống layer không phá hủy, hơn 200 bộ lọc dựng sẵn và khả năng xử lý hàng loạt. Giao diện tối ưu cho cả người mới bắt đầu lẫn nhà thiết kế chuyên nghiệp.','1. Giải nén file tải về.\n2. Chạy setup.exe với quyền Administrator.\n3. Chọn thư mục cài đặt và bấm Install.\n4. Khởi động lại máy sau khi hoàn tất.','- Thêm bộ lọc AI Denoise\n- Tăng tốc render 30%\n- Sửa lỗi crash khi mở file RAW','https://api.dicebear.com/9.x/shapes/svg?seed=PhotoShine','{https://images.unsplash.com/photo-1626785774573-4b799315345d?w=1200,https://images.unsplash.com/photo-1618004912476-29818d81ae2e?w=1200}','5.2.1','412 MB','Windows 10/11','Shine Labs','Freeware','software',(select id from public.categories where slug='do-hoa'),true,true,18420,1,'2026-08-12'),
('vectorly','Vectorly','Thiết kế vector đa nền tảng','Vectorly là phần mềm thiết kế vector mã nguồn mở, hỗ trợ SVG chuẩn W3C, lưới thông minh và xuất file cho in ấn.','Cài đặt bằng file .msi, làm theo hướng dẫn trên màn hình.','- Hỗ trợ biến thể font\n- Cải thiện công cụ bút','https://api.dicebear.com/9.x/shapes/svg?seed=Vectorly','{https://images.unsplash.com/photo-1561070791-2526d30994b5?w=1200}','3.4.0','168 MB','Windows, macOS, Linux','Vectorly Team','Open Source','software',(select id from public.categories where slug='do-hoa'),true,false,9310,2,'2026-07-02'),
('officepro-suite','OfficePro Suite','Bộ ứng dụng văn phòng đầy đủ','OfficePro Suite gồm trình soạn thảo văn bản, bảng tính, trình chiếu và công cụ PDF, tương thích hoàn toàn với định dạng DOCX/XLSX/PPTX.','Chạy trình cài đặt và chọn các thành phần cần dùng.','- Thêm chế độ cộng tác\n- Sửa lỗi in ấn','https://api.dicebear.com/9.x/shapes/svg?seed=OfficePro','{https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200}','2026.1','740 MB','Windows 10/11','OpenOffice Foundation','Freeware','software',(select id from public.categories where slug='van-phong'),true,false,25730,3,'2026-06-20'),
('pdf-master','PDF Master','Đọc, chỉnh sửa và ký PDF','PDF Master cho phép gộp, tách, nén, OCR và ký số tài liệu PDF ngay trên máy tính mà không cần tải lên internet.','Giải nén và chạy PDFMaster.exe (bản portable không cần cài đặt).','- OCR tiếng Việt chính xác hơn','https://api.dicebear.com/9.x/shapes/svg?seed=PDFMaster','{https://images.unsplash.com/photo-1568667256549-094345857637?w=1200}','8.0.3','96 MB','Windows','Master Tools','Freemium','software',(select id from public.categories where slug='van-phong'),false,true,14100,4,'2026-08-18'),
('codeforge','CodeForge IDE','IDE hiện đại cho lập trình viên','CodeForge IDE hỗ trợ hơn 40 ngôn ngữ, gợi ý mã thông minh, debug tích hợp và hệ sinh thái extension phong phú.','Tải bản cài đặt phù hợp hệ điều hành và chạy trình cài đặt.','- Hỗ trợ Bun 2\n- Terminal nhanh hơn','https://api.dicebear.com/9.x/shapes/svg?seed=CodeForge','{https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200,https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200}','1.94.2','320 MB','Windows, macOS, Linux','Forge Studio','Open Source','software',(select id from public.categories where slug='lap-trinh'),true,true,33280,5,'2026-08-22'),
('gitlens-desktop','GitDesk','Quản lý Git bằng giao diện trực quan','GitDesk giúp bạn xem lịch sử commit, giải quyết xung đột và quản lý nhiều repository trong một cửa sổ duy nhất.','Cài đặt bình thường, đăng nhập tài khoản Git để đồng bộ.','- Hỗ trợ worktree','https://api.dicebear.com/9.x/shapes/svg?seed=GitDesk','{https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200}','4.1.0','142 MB','Windows, macOS','DeskTools','Freeware','software',(select id from public.categories where slug='lap-trinh'),false,false,7420,6,'2026-05-11'),
('guardian-antivirus','Guardian Antivirus','Bảo vệ máy tính thời gian thực','Guardian Antivirus quét theo thời gian thực, chặn ransomware và bảo vệ trình duyệt khỏi trang lừa đảo.','Gỡ phần mềm diệt virus khác trước khi cài đặt Guardian.','- Cập nhật cơ sở dữ liệu virus','https://api.dicebear.com/9.x/shapes/svg?seed=Guardian','{https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200}','12.6','210 MB','Windows 10/11','Guardian Security','Freemium','software',(select id from public.categories where slug='bao-mat'),true,false,20140,7,'2026-07-28'),
('keyvault','KeyVault','Quản lý mật khẩu mã hóa cục bộ','KeyVault lưu trữ mật khẩu bằng mã hóa AES-256 hoàn toàn trên máy bạn, hỗ trợ tự động điền và sinh mật khẩu mạnh.','Chạy file cài đặt và tạo kho mật khẩu mới.','- Thêm tiện ích trình duyệt','https://api.dicebear.com/9.x/shapes/svg?seed=KeyVault','{https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=1200}','2.9.4','48 MB','Windows, macOS, Linux','Vault Project','Open Source','tool',(select id from public.categories where slug='bao-mat'),false,true,11250,8,'2026-08-05'),
('cleanboost','CleanBoost','Dọn rác và tăng tốc máy tính','CleanBoost dọn file tạm, quản lý khởi động cùng Windows và tối ưu registry một cách an toàn.','Bản portable: chỉ cần giải nén và chạy.','- Thêm chế độ dọn sâu','https://api.dicebear.com/9.x/shapes/svg?seed=CleanBoost','{https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=1200}','7.3.2','32 MB','Windows','Boost Soft','Freeware','tool',(select id from public.categories where slug='tien-ich'),false,false,16880,9,'2026-06-30'),
('backupmate','BackupMate','Sao lưu và khôi phục dữ liệu','BackupMate tạo bản sao lưu gia tăng theo lịch, hỗ trợ ổ ngoài và dịch vụ đám mây phổ biến.','Cài đặt, chọn thư mục cần sao lưu và đặt lịch.','- Hỗ trợ nén Zstd','https://api.dicebear.com/9.x/shapes/svg?seed=BackupMate','{https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200}','6.0.0','120 MB','Windows, Linux','Mate Software','Freeware','tool',(select id from public.categories where slug='tien-ich'),false,false,6320,10,'2026-04-19'),
('mediaflow-player','MediaFlow Player','Trình phát mọi định dạng','MediaFlow Player phát được hầu hết định dạng video/audio, hỗ trợ phụ đề tự động và tăng tốc phần cứng.','Cài đặt và đặt làm trình phát mặc định nếu muốn.','- Hỗ trợ AV1 tăng tốc phần cứng','https://api.dicebear.com/9.x/shapes/svg?seed=MediaFlow','{https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1200}','4.8.1','78 MB','Windows, macOS, Linux','Flow Media','Open Source','software',(select id from public.categories where slug='multimedia'),true,false,28960,11,'2026-08-01'),
('soundwave-converter','SoundWave Converter','Chuyển đổi âm thanh hàng loạt','SoundWave Converter chuyển đổi giữa MP3, FLAC, WAV, AAC với chất lượng cao và xử lý hàng loạt cực nhanh.','Bản portable, không cần cài đặt.','- Thêm định dạng Opus','https://api.dicebear.com/9.x/shapes/svg?seed=SoundWave','{https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200}','3.2.0','54 MB','Windows','Wave Tools','Freeware','tool',(select id from public.categories where slug='multimedia'),false,true,8740,12,'2026-08-20');

insert into public.download_links (software_id,label,provider,url,sort_order)
select id, 'Google Drive', 'google-drive', 'https://drive.google.com/file/d/demo-' || slug, 1 from public.software
union all
select id, 'MediaFire', 'mediafire', 'https://www.mediafire.com/file/demo-' || slug, 2 from public.software
union all
select id, 'Link trực tiếp', 'direct', 'https://cdn.example.com/downloads/' || slug || '.zip', 3 from public.software;

insert into public.posts (slug,title,excerpt,content,cover_url,sort_order) values
('cach-cai-dat-phan-mem-an-toan','Cách cài đặt phần mềm an toàn trên Windows','Những nguyên tắc cơ bản giúp bạn tránh phần mềm độc hại khi tải và cài đặt.','Luôn tải phần mềm từ nguồn tin cậy, kiểm tra chữ ký số, đọc kỹ từng bước cài đặt và bỏ chọn các phần mềm đi kèm không cần thiết. Nên quét file bằng phần mềm diệt virus trước khi chạy.','https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200',1),
('top-10-cong-cu-mien-phi','Top 10 công cụ miễn phí nên có trên máy tính','Danh sách các công cụ nhẹ, miễn phí và cực kỳ hữu ích cho công việc hằng ngày.','Từ trình nén file, công cụ chụp màn hình đến phần mềm dọn rác — đây là những công cụ giúp máy tính của bạn hoạt động hiệu quả hơn mỗi ngày.','https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200',2),
('toi-uu-windows-11','Tối ưu Windows 11 cho máy cấu hình thấp','Các thiết lập giúp Windows 11 chạy mượt hơn trên máy đời cũ.','Tắt hiệu ứng động, giảm ứng dụng khởi động cùng hệ thống, dọn dẹp ổ đĩa định kỳ và cập nhật driver là những bước đơn giản nhưng hiệu quả.','https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1200',3);

insert into public.banners (title,subtitle,image_url,link_url,cta_label,is_active,sort_order) values
('Kho phần mềm sạch, không quảng cáo','Mọi liên kết đều được kiểm tra thủ công trước khi đăng tải','https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600','/phan-mem','Khám phá ngay',true,1);

insert into public.home_sections (key,title,subtitle,enabled,sort_order) values
('hero','Kho phần mềm & công cụ tuyển chọn','Tải nhanh, an toàn, luôn cập nhật phiên bản mới nhất',true,1),
('featured','Phần mềm nổi bật','Những phần mềm được tuyển chọn kỹ lưỡng',true,2),
('new','Mới cập nhật','Vừa được thêm hoặc cập nhật phiên bản',true,3),
('categories','Danh mục','Duyệt theo nhóm phần mềm',true,4),
('popular','Được tải nhiều','Xếp hạng theo lượt tải thực tế',true,5),
('banner','Banner','Khu vực banner tùy chỉnh',true,6),
('posts','Tài nguyên & bài viết','Hướng dẫn và mẹo hữu ích',true,7);

insert into public.site_settings (id,data) values ('main', jsonb_build_object(
  'siteName','DevKho',
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
  'footerText','© 2026 DevKho — Chia sẻ phần mềm và công cụ hữu ích.',
  'footerLinks', jsonb_build_array(
     jsonb_build_object('label','Liên hệ','href','/gioi-thieu'),
     jsonb_build_object('label','Điều khoản','href','/gioi-thieu')),
  'aboutTitle','Về DevKho',
  'aboutContent','DevKho là trang cá nhân nơi mình chia sẻ những phần mềm, công cụ và tài nguyên đã dùng qua và thấy thực sự hữu ích. Mọi liên kết đều được kiểm tra trước khi đăng tải.',
  'seoTitle','DevKho — Kho phần mềm & công cụ tuyển chọn',
  'seoDescription','Tải phần mềm, công cụ và tài nguyên miễn phí, an toàn, luôn cập nhật phiên bản mới nhất.',
  'seoKeywords','tải phần mềm, công cụ miễn phí, phần mềm windows, tài nguyên',
  'ogImage',''
));