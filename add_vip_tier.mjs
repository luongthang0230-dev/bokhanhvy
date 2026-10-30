// Thêm GÓI VIP (mã tier_vip) vào web. Chạy trong thư mục gốc repo:  node add_vip_tier.mjs
// Chỉ sửa đúng 1 file: src/lib/auto-auth-core.ts (2 chỗ). Có lỗi => KHÔNG ghi gì. Chạy lại lần 2 cũng an toàn (báo "đã vá sẵn").
import fs from "node:fs";
const FILE = "src/lib/auto-auth-core.ts";
if (!fs.existsSync(FILE)) { console.error("Không thấy " + FILE + " - chạy sai thư mục? Phải chạy ở thư mục gốc repo (cùng chỗ có package.json)."); process.exit(1); }
let t = fs.readFileSync(FILE, "utf8");
const crlf = t.includes("\r\n");
t = t.replace(/\r\n/g, "\n");
if (t.includes('token: "tier_vip"')) { console.log("= đã vá sẵn gói VIP:", FILE); process.exit(0); }
const ops = [
  ["thêm gói VIP vào danh sách gói",
   '  { key: "daigia", token: "tier_daigia", label: "Đại gia" },\n] as const;',
   '  { key: "daigia", token: "tier_daigia", label: "Đại gia" },\n  // Gói VIP (gói thứ 4): full tính năng, 30 ngày (admin đặt hạn), không giới hạn nhân vật. Phải là gói CUỐI (cao nhất) trong danh sách này.\n  { key: "vip", token: "tier_vip", label: "VIP" },\n] as const;'],
  ["đổi nhãn quyền VIP (tuỳ chọn, chỉ là chữ hiển thị)",
   'label: "VIP: Tự bán nguyên liệu đã nhặt (tab Nhặt)"',
   'label: "VIP: Tự bán đồ + Né boss khi nhặt (tab Nhặt)"'],
];
const errs = [];
for (const [name, from, to] of ops) {
  const n = t.split(from).length - 1;
  if (n !== 1) { errs.push("[" + name + "] tìm thấy " + n + " chỗ khớp (cần đúng 1) - file đã khác bản mình xem, gửi lại file cho mình"); continue; }
  t = t.replace(from, () => to);
}
if (errs.length) { console.error("KHÔNG GHI GÌ. Lỗi:\n- " + errs.join("\n- ")); process.exit(1); }
fs.writeFileSync(FILE, crlf ? t.replace(/\n/g, "\r\n") : t);
console.log("+ đã thêm gói VIP (tier_vip) vào", FILE);
console.log("Xong. Tiếp theo: (không bắt buộc) npm run build  ->  rồi deploy như mọi lần.");
