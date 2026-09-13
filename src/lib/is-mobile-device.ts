/** Nhận diện THIẾT BỊ điện thoại thật (Android/iOS) qua user agent — không
 *  phải theo độ rộng cửa sổ, để không nhầm giữa "cửa sổ máy tính bị thu
 *  nhỏ" với "đang dùng điện thoại". Dùng chung cho DonateWidget và việc ẩn
 *  bong bóng donate/chat trên trang /tinhluong khi mở bằng điện thoại. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod|Windows Phone|Mobile(?!.*iPad)/i.test(navigator.userAgent);
}
