# Deploy lên Vercel

Dự án đã được chuyển từ runtime của Lovable sang cấu hình Vite + Nitro thuần,
dùng preset `vercel` có sẵn của Nitro (zero-config): lệnh build sinh ra thư mục
`.vercel/output` (chuẩn Build Output API) mà Vercel tự nhận diện — không cần
`vercel.json`.

## Các bước

1. Đẩy code lên GitHub/GitLab/Bitbucket (hoặc dùng `vercel` CLI để deploy trực
   tiếp từ máy).
2. Trên Vercel: **New Project** → chọn repo này.
   - Framework Preset: để **Other** (không chọn "Vite") vì Nitro tự sinh
     `.vercel/output` — Vercel sẽ tự nhận ra định dạng này.
   - Build Command: `npm run build` (mặc định, không cần đổi).
   - Output Directory: để trống/mặc định (không cần chỉnh, vì Nitro build
     thẳng ra `.vercel/output`).
3. Thêm **Environment Variables** trong Project Settings → Environment
   Variables (copy giá trị từ file `.env` ở gốc dự án):

   | Key | Dùng ở đâu | Ghi chú |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Client (trình duyệt) | URL project Supabase |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Client (trình duyệt) | Khóa publishable/anon — an toàn khi lộ ra |
   | `SUPABASE_URL` | Server (SSR + xác thực admin) | Giống `VITE_SUPABASE_URL` |
   | `SUPABASE_PUBLISHABLE_KEY` | Server (SSR + xác thực admin) | Giống `VITE_SUPABASE_PUBLISHABLE_KEY` |

   Đặt cho cả 3 môi trường (Production/Preview/Development) nếu muốn preview
   deploy cũng chạy được.

4. Bấm **Deploy**. Vercel sẽ chạy `npm install && npm run build`, nhận thư mục
   `.vercel/output` và deploy: phần tĩnh (HTML/CSS/JS) lên CDN, phần SSR chạy
   trong 1 Serverless Function (Node.js) đặt tại `.vercel/output/functions/__server.func`.

## Kiểm tra build cục bộ trước khi deploy (tuỳ chọn)

```bash
npm install
npm run build      # sinh .vercel/output
npx vite preview    # xem thử bản build tĩnh
# hoặc cài Vercel CLI rồi chạy:
npx vercel build     # build đúng như trên Vercel
npx vercel deploy --prebuilt   # deploy thư mục .vercel/output đã build
```

## Database (Supabase)

⚠️ **Quan trọng:** Dự án gốc dùng "Lovable Cloud" — một Supabase project do
Lovable tự động cấp phát và quản lý, **không nằm trong tài khoản Supabase của
bạn**. Khi tách dự án ra khỏi Lovable, project đó có thể ngừng hoạt động bất
cứ lúc nào (biểu hiện: lỗi `net::ERR_NAME_NOT_RESOLVED` khi gọi
`*.supabase.co`). Vì vậy cần tạo **Supabase project của riêng bạn**:

1. Vào **https://supabase.com/dashboard** → đăng ký/đăng nhập (miễn phí) →
   **New Project** → đặt tên tuỳ ý, chọn vùng gần Việt Nam (Singapore), đặt
   mật khẩu database (lưu lại mật khẩu này).
2. Đợi project khởi tạo xong (~2 phút) → vào **SQL Editor** (menu bên trái) →
   **New query**.
3. Mở file **`SETUP.sql`** ở gốc dự án này, copy toàn bộ nội dung, dán vào ô
   query → bấm **Run**. Script này dựng lại đầy đủ bảng, quyền truy cập
   (RLS), và 2 phần mềm CPK Filter Tool / Creat Card (link Google Drive để
   placeholder — vào `/admin` sửa lại thành link thật sau khi deploy xong).
4. Vào **Settings → API** trong Supabase project mới → copy:
   - **Project URL** (dạng `https://xxxxx.supabase.co`)
   - **anon / publishable key**
5. Vào Vercel → project → **Settings → Environment Variables** → sửa lại giá
   trị của 4 biến sau bằng giá trị vừa copy ở bước 4 (cả `VITE_` và không
   `VITE_` đều dùng chung URL/key, chỉ khác tên biến):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = anon/publishable key
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = anon/publishable key
6. Vào tab **Deployments** → bản mới nhất → **⋯ → Redeploy** để áp dụng biến
   môi trường mới.
7. Vào **`/admin/login`** trên trang web → **"Tạo tài khoản"** lần đầu bằng
   email/mật khẩu của bạn → tài khoản đầu tiên tạo ra sẽ **tự động thành
   admin** (theo logic có sẵn trong `SETUP.sql`).
8. Vào **`/admin`** → sửa lại link Google Drive thật cho 2 phần mềm đã có sẵn.

Các file trong `supabase/migrations/` vẫn được giữ lại để tham khảo lịch sử
thay đổi, nhưng **`SETUP.sql` mới là file cần dùng** để dựng project mới từ
đầu — nó đã gộp sẵn tất cả migration theo đúng thứ tự.
