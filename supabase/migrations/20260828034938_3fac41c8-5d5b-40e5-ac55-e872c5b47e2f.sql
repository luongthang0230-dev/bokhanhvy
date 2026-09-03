delete from public.download_links;
delete from public.software;
delete from public.banners;
delete from public.posts;
delete from public.home_sections;

insert into public.software (slug,name,tagline,description,version,size_label,os,icon_url,published,sort_order) values
('phan-mem-mau-1','Phần mềm mẫu 1','Mô tả ngắn gọn về phần mềm này','Đây là phần mềm mẫu. Vào trang quản trị để sửa tên, mô tả và thay link Google Drive thật của bạn.','1.0','50 MB','Windows','https://api.dicebear.com/9.x/shapes/svg?seed=App1',true,1),
('phan-mem-mau-2','Phần mềm mẫu 2','Mô tả ngắn gọn về phần mềm này','Đây là phần mềm mẫu. Vào trang quản trị để sửa tên, mô tả và thay link Google Drive thật của bạn.','2.1','120 MB','Windows','https://api.dicebear.com/9.x/shapes/svg?seed=App2',true,2);

insert into public.download_links (software_id,label,provider,url,sort_order)
select id,'Google Drive','google-drive','https://drive.google.com/file/d/THAY_LINK_CUA_BAN',1 from public.software;