# Website tải phần mềm

Hãy tạo một website cá nhân chuyên nghiệp để chia sẻ link tải phần mềm, công cụ và tài nguyên, có hệ thống quản trị riêng cho Admin. Giao diện hiện đại, tốc độ nhanh, responsive tốt trên PC và điện thoại.

1. Trang người dùng

Thiết kế theo phong cách các website download phần mềm chuyên nghiệp, sạch sẽ và dễ sử dụng.

Header:

Logo/tên website cá nhân.

Menu: Trang chủ, Phần mềm, Công cụ, Tài nguyên, Giới thiệu.

Ô tìm kiếm phần mềm.

Giao diện responsive trên mobile.

Trang chủ:

Hero section giới thiệu website.

Thanh tìm kiếm lớn: "Tìm kiếm phần mềm, công cụ..."

Khu vực phần mềm nổi bật.

Phần mềm mới cập nhật.

Phần mềm được tải nhiều.

Các danh mục phần mềm.

Có thể hiển thị banner/quảng cáo tùy chỉnh từ Admin.

Trang danh sách phần mềm:

Hiển thị dạng card chuyên nghiệp.

Icon/ảnh phần mềm.

Tên phần mềm.

Phiên bản.

Hệ điều hành.

Mô tả ngắn.

Ngày cập nhật.

Nút "Xem chi tiết".

Trang chi tiết phần mềm:

Tên + icon phần mềm.

Mô tả chi tiết.

Screenshot/hình ảnh.

Phiên bản.

Dung lượng.

Hệ điều hành.

Ngày cập nhật.

Thông tin phiên bản.

Hướng dẫn cài đặt/sử dụng.

Nút TẢI XUỐNG nổi bật.

Hỗ trợ nhiều link tải/mirror.

Có thể hiển thị Google Drive, MediaFire, GitHub, OneDrive hoặc link trực tiếp.

Nút sao chép link tải.

Phần mềm liên quan.

2. Hệ thống Admin

Tạo trang đăng nhập Admin riêng, ví dụ /admin/login.

Sau khi đăng nhập thành công, Admin có Dashboard quản trị.

Admin có thể tự do thiết lập gần như toàn bộ giao diện website mà không cần sửa code, bao gồm:

Quản lý nội dung

Thêm/sửa/xóa phần mềm.

Thêm icon, ảnh, screenshot.

Tạo danh mục.

Thêm phiên bản.

Thêm nhiều link download/mirror.

Thiết lập phần mềm nổi bật.

Thiết lập phần mềm mới.

Sắp xếp thứ tự hiển thị.

Quản lý bài viết/tài nguyên.

Tùy chỉnh giao diện

Logo.

Tên website.

Favicon.

Màu chủ đạo.

Màu nền.

Font chữ.

Dark/Light mode.

Header.

Footer.

Banner.

Hero section.

Các section trên trang chủ.

Thứ tự các section.

Hiện/ẩn từng section.

Nội dung text.

Hình ảnh.

Nút và link.

Cho phép Admin bật/tắt, kéo thả và sắp xếp các section trên trang chủ.

Ví dụ:
Hero → Phần mềm nổi bật → Phần mềm mới → Danh mục → Bài viết → Footer

Admin có thể đổi thành:
Hero → Danh mục → Phần mềm mới → Banner → Phần mềm nổi bật

3. Dashboard Admin

Thiết kế Dashboard hiện đại với:

Tổng số phần mềm.

Tổng số lượt tải.

Tổng số danh mục.

Phần mềm mới cập nhật.

Thống kê lượt tải theo ngày/tháng.

Quản lý nhanh nội dung.

4. Quản lý SEO

Admin có thể thiết lập:

Website title.

Meta description.

Keywords.

Open Graph image.

URL slug.

SEO title/description riêng cho từng phần mềm.

Sitemap/robots.txt nếu phù hợp.

5. Yêu cầu kỹ thuật

Sử dụng kiến trúc frontend/backend rõ ràng.

Database để lưu toàn bộ nội dung và cấu hình giao diện.

Authentication an toàn cho Admin.

Không hard-code nội dung website.

Các thiết lập trong Admin phải được lưu vào database và không bị mất sau khi F5 hoặc đăng nhập lại.

Responsive hoàn toàn.

Tối ưu tốc độ tải trang.

URL thân thiện với SEO.

Có loading state, empty state và error state.

Thiết kế hiện đại, chuyên nghiệp, không quá màu mè.

Có animation nhẹ, không lạm dụng.

6. Quan trọng nhất

Hãy xây dựng hệ thống theo hướng CMS cá nhân thu nhỏ:

Admin đăng nhập → chỉnh giao diện → thêm phần mềm → thêm link tải → thay đổi banner/nội dung → sắp xếp section → lưu → website người dùng cập nhật ngay.

Không yêu cầu Admin biết lập trình.

Hãy tạo toàn bộ giao diện hoàn chỉnh ngay từ đầu, sử dụng dữ liệu mẫu để tôi có thể xem website hoạt động như một website chia sẻ phần mềm thực tế.

Ưu tiên UX/UI chuyên nghiệp, bố cục giống các website phần mềm hiện đại, nhưng không sao chép nguyên mẫu của bất kỳ website nào.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7dc9ba8a-4228-40c8-9911-023096d63963).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
