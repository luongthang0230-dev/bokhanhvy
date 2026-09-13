import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  parseThangLuongExcel,
  replaceThangLuong,
  fetchAllThangLuong,
  type ThangLuongRow,
} from "@/lib/thang-luong-api";

function formatVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

/** Admin upload file Excel "thang lương" — dữ liệu lưu ở server, dùng chung
 *  cho MỌI tài khoản Tính lương (không phải cục bộ trên máy như bản EXE). */
export function AdminThangLuong() {
  const [rows, setRows] = useState<ThangLuongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchAllThangLuong());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được thang lương");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const parsed = await parseThangLuongExcel(file);
      if (
        !window.confirm(
          `Đọc được ${parsed.length} bậc lương từ file. Thao tác này sẽ THAY THẾ toàn bộ thang lương hiện có (dùng chung cho mọi tài khoản). Tiếp tục?`,
        )
      ) {
        return;
      }
      const count = await replaceThangLuong(parsed);
      toast.success(`Đã cập nhật thang lương mới (${count} bậc lương).`);
      reload();
    } catch (err) {
      console.error("Đọc file thang lương thất bại:", err);
      toast.error(err instanceof Error ? err.message : "Đọc file Excel thất bại", { duration: 10000 });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="card-surface mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <p className="font-medium">Thang lương (mốc phụ cấp ABC)</p>
          <p className="text-xs text-muted-foreground">
            File Excel: mỗi sheet là 1 nhóm (VD "Nhân viên", "CN"), cột "Bậc lương", "Lương cơ bản", và
            5 cột A/B/C/D/E. Dữ liệu áp dụng cho tất cả tài khoản Tính lương.
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="mr-1.5 h-4 w-4" /> {uploading ? "Đang xử lý..." : "Upload file Excel"}
        </Button>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Tải lại
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <FileSpreadsheet className="h-8 w-8" />
          Chưa có dữ liệu thang lương — upload file Excel để tài khoản Tính lương tra được mốc ABC.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto p-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Loại</th>
                <th className="py-2 pr-2">Bậc lương</th>
                <th className="py-2 pr-2 text-right">LCB</th>
                <th className="py-2 pr-2 text-right">A</th>
                <th className="py-2 pr-2 text-right">B</th>
                <th className="py-2 pr-2 text-right">C</th>
                <th className="py-2 pr-2 text-right">D</th>
                <th className="py-2 pr-2 text-right">E</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">{r.loai}</td>
                  <td className="py-1.5 pr-2">{r.bacLuong}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.lcb)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.a)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.b)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.c)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.d)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatVnd(r.e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
        Upload file mới sẽ thay thế toàn bộ bảng hiện tại (giống nút "Cập nhật thang lương" trên bản
        EXE) — các tài khoản đang mở trang Tính lương cần nhập lại/đổi LCB để thấy mốc ABC mới nhất.
      </div>
    </div>
  );
}
