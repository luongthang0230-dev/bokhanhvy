// Service worker CHỈ phục vụ khu vực /tinhluong (đăng ký với scope riêng ở
// tinhluong.tsx / tinhluong.login.tsx) — không ảnh hưởng phần còn lại của
// website. Mục tiêu: trang vẫn MỞ ĐƯỢC khi mất mạng (dùng bản đã cache lần
// trước), dữ liệu thật (mã SJ, bảng lương...) do lớp payroll-storage.ts tự
// lưu cache riêng trong localStorage, KHÔNG cache ở đây.
const CACHE_NAME = "tinhluong-shell-v2";
const OFFLINE_URL = "/tinhluong";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // không đụng vào POST (server functions, API...)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // không cache request sang Supabase...

  // Trang HTML (điều hướng): network trước, lỗi thì trả bản cache gần nhất.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached ?? caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Tài nguyên tĩnh (JS/CSS/ảnh/icon): cache trước cho nhanh + luôn cập
  // nhật ngầm bản mới nếu có mạng (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // QUAN TRỌNG: phải clone() NGAY LẬP TỨC, trước khi trả `res` về
          // cho trình duyệt tiêu thụ — clone() muộn (vd trong .then() của
          // caches.open()) sẽ ăn lỗi "Response body is already used" và
          // làm hỏng cả request đó (khiến JS không load được, trang treo).
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
