import { useState } from "react";
import { Gift, Minus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const BANK_INFO = {
  bankName: "VietinBank",
  alias: "0917969587",
  accountNumber: "104867182645",
  accountHolder: "Lương Quốc Thắng",
};

/**
 * Khung "Ủng hộ" nổi góc dưới trái, mặc định hiển thị sẵn (không phải dạng
 * bong bóng thu gọn). Có nút "-" để thu nhỏ lại thành 1 nút tròn, bấm lại
 * nút đó để mở ra như ban đầu.
 */
export function DonateWidget() {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(BANK_INFO.accountNumber);
      setCopied(true);
      toast.success("Đã copy số tài khoản");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không copy được, bạn tự chép giúp mình nhé");
    }
  }

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
    <div className="fixed bottom-6 left-6 z-40 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-white">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Gift className="h-4 w-4" /> Ủng hộ tác giả
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Thu nhỏ"
          className="rounded-full p-1 hover:bg-white/20"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col items-center gap-2 p-4">
        <img
          src="/donate-qr.jpg"
          alt="Mã QR donate qua VietinBank"
          className="w-52 rounded-lg border border-border"
        />
        <p className="text-center text-xs text-muted-foreground">
          Quét mã bằng app ngân hàng bất kỳ (VietQR)
        </p>
        <div className="mt-1 w-full space-y-1 rounded-lg bg-secondary/50 p-3 text-xs">
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Ngân hàng</span>
            <span className="font-medium">{BANK_INFO.bankName}</span>
          </p>
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Chủ TK</span>
            <span className="font-medium">{BANK_INFO.accountHolder}</span>
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="truncate font-mono font-medium">{BANK_INFO.accountNumber}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy số tài khoản"
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Đã copy" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
