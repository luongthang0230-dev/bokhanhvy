import { useEffect, useState } from "react";
import { Gift, Minus } from "lucide-react";

/**
 * Khung "Ủng hộ" nổi góc dưới trái. Trên màn hình rộng (máy tính) mặc định
 * hiển thị sẵn dạng mở. Trên màn hình hẹp (điện thoại) mặc định thu gọn
 * thành nút tròn để không che mất nội dung chính — người dùng tự bấm mở
 * nếu muốn. Có nút "-" để thu nhỏ lại bất kỳ lúc nào, bấm nút tròn để mở
 * lại. Khung cũng tự giới hạn chiều cao theo màn hình, cuộn được nếu cần,
 * để không bao giờ bị tràn ra ngoài trên các màn hình thấp.
 */
export function DonateWidget() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Màn hình hẹp (điện thoại) -> mặc định thu gọn để tránh che nội dung.
    if (window.matchMedia("(max-width: 640px)").matches) setOpen(false);
  }, []);

  if (!open) {
    return (
      <div className="fixed bottom-6 left-6 z-40">
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
    <div className="fixed bottom-6 left-6 z-40 flex max-h-[calc(100vh-3rem)] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
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
