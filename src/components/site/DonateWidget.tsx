import { useEffect, useState } from "react";
import { Gift, Minus } from "lucide-react";

/**
 * Khung "Ủng hộ" nổi góc dưới trái.
 * - Điện thoại (theo loại thiết bị, không phải theo độ rộng cửa sổ): mặc
 *   định thu gọn thành nút tròn, tránh che nội dung trên màn hình nhỏ.
 * - Máy tính: luôn hiển thị sẵn dạng khung mở, nhưng bề rộng co giãn theo
 *   % chiều rộng màn hình (không cố định px) nên tự nhỏ lại ở màn hình
 *   phân giải thấp / cửa sổ bị thu nhỏ, không đè lên nội dung bên cạnh.
 * Có nút "-" để thu nhỏ lại bất kỳ lúc nào, bấm nút tròn để mở lại.
 */
export function DonateWidget() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Nhận diện THIẾT BỊ điện thoại (không phải độ rộng cửa sổ) — để dù
    // người dùng resize cửa sổ máy tính nhỏ lại, khung vẫn không tự thu
    // gọn thành bong bóng như trên điện thoại thật.
    const isPhone = /Android|iPhone|iPod|Windows Phone|Mobile(?!.*iPad)/i.test(
      navigator.userAgent,
    );
    if (isPhone) setOpen(false);
  }, []);

  if (!open) {
    return (
      <div className="fixed bottom-48 right-6 z-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ủng hộ tác giả"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl transition-transform hover:scale-105"
        >
          <Gift className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-48 right-6 z-40 flex max-h-[calc(100vh-14rem)] w-[clamp(200px,22vw,384px)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
        <p className="flex items-center gap-1.5 text-base font-semibold">
          <Gift className="h-5 w-5" /> Ủng hộ tác giả
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Thu nhỏ"
          className="rounded-full p-1 hover:bg-white/20"
        >
          <Minus className="h-5 w-5" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">
        <div className="w-full overflow-hidden rounded-2xl shadow-sm">
          <img
            src="/donate-qr.jpg"
            alt="Mã QR donate qua VietinBank"
            className="block w-full scale-[1.03]"
          />
        </div>
      </div>
    </div>
  );
}
