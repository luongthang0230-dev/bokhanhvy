import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

/**
 * Đọc file Excel "thang lương" + tra cứu mốc ABC theo LCB — dịch 1:1 từ
 * `sj_payroll/core/thang_luong_import.py` (đọc file) và
 * `database.get_thang_luong_options()` (tra cứu) của app EXE gốc.
 * Khác biệt duy nhất: dữ liệu này lưu Ở SERVER (bảng payroll_thang_luong,
 * dùng chung cho mọi tài khoản), không phải trong SQLite cục bộ như EXE.
 */

export interface ThangLuongRow {
  loai: string;
  bacLuong: string;
  lcb: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  thuTu: number;
}

const REQUIRED_LEVELS = ["A", "B", "C", "D", "E"] as const;
const GRADE_HEADER_ALIASES = new Set(["bac luong", "thang luong"]);
const LCB_HEADER_ALIASES = new Set(["luong co ban", "lcb", "luong co ban (lcb)"]);

/** Bỏ dấu tiếng Việt + viết thường + gộp khoảng trắng, để so khớp tiêu đề
 *  cột không phân biệt hoa/thường/dấu — giống hệt hàm _norm() trong Python. */
function normalizeHeader(text: unknown): string {
  const s = String(text ?? "").trim().toLowerCase();
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  return noAccents.split(/\s+/).filter(Boolean).join(" ");
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.round(value);
  const s = String(value).replace(/\./g, "").replace(/,/g, "").trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n) : 0;
}

interface HeaderCols {
  bac: number;
  lcb: number;
  levels: Record<string, number>;
}

interface HeaderDetectResult {
  cols: HeaderCols | null;
  /** Những gì đã nhận diện được ở dòng tiêu đề khớp nhất, để báo lỗi cụ thể
   *  thay vì chỉ nói chung chung "đọc file thất bại". */
  found: { bac: boolean; lcb: boolean; levels: string[] };
}

function detectHeaderColumns(row: unknown[]): HeaderDetectResult {
  const empty: HeaderDetectResult = { cols: null, found: { bac: false, lcb: false, levels: [] } };
  if (!row || row.length === 0) return empty;
  let bacCol: number | null = null;
  let lcbCol: number | null = null;
  const levelCols: Record<string, number> = {};
  row.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    if (bacCol === null && GRADE_HEADER_ALIASES.has(norm)) {
      bacCol = idx;
      return;
    }
    if (lcbCol === null && LCB_HEADER_ALIASES.has(norm)) {
      lcbCol = idx;
      return;
    }
    const firstToken = norm.split(" ")[0]?.toUpperCase() ?? "";
    if ((REQUIRED_LEVELS as readonly string[]).includes(firstToken) && !(firstToken in levelCols)) {
      levelCols[firstToken] = idx;
    }
  });
  const found = { bac: bacCol !== null, lcb: lcbCol !== null, levels: Object.keys(levelCols) };
  if (bacCol === null || lcbCol === null || Object.keys(levelCols).length < REQUIRED_LEVELS.length) {
    return { cols: null, found };
  }
  return { cols: { bac: bacCol, lcb: lcbCol, levels: levelCols }, found };
}

export class ThangLuongParseError extends Error {}

/** Đọc toàn bộ workbook, mỗi sheet là 1 "loại" thang lương — giống
 *  parse_thang_luong_excel() của Python: tự quét cột theo tên tiêu đề, bỏ
 *  qua sheet không đủ cột bắt buộc. Nếu KHÔNG sheet nào đủ cột, ném lỗi có
 *  liệt kê rõ từng sheet còn thiếu gì, thay vì chỉ báo "thất bại" chung chung. */
export async function parseThangLuongExcel(file: File): Promise<ThangLuongRow[]> {
  let wb: XLSX.WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array" });
  } catch (err) {
    throw new ThangLuongParseError(
      `Không mở được file "${file.name}" — file có thể bị hỏng hoặc không đúng định dạng .xlsx/.xls. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  if (wb.SheetNames.length === 0) {
    throw new ThangLuongParseError("File Excel không có sheet nào.");
  }

  const out: ThangLuongRow[] = [];
  let thuTu = 0;
  const sheetDiagnostics: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

    let headerIdx = -1;
    let cols: HeaderCols | null = null;
    let bestFound: HeaderDetectResult["found"] = { bac: false, lcb: false, levels: [] };
    for (let i = 0; i < rows.length; i++) {
      const detected = detectHeaderColumns(rows[i] ?? []);
      if (detected.found.levels.length > bestFound.levels.length || (detected.found.bac && detected.found.lcb))
        bestFound = detected.found;
      if (detected.cols) {
        headerIdx = i;
        cols = detected.cols;
        break;
      }
    }
    if (headerIdx === -1 || !cols) {
      const missing: string[] = [];
      if (!bestFound.bac) missing.push('"Bậc lương" (hoặc "Thang lương")');
      if (!bestFound.lcb) missing.push('"Lương cơ bản" (hoặc "LCB")');
      const missingLevels = REQUIRED_LEVELS.filter((l) => !bestFound.levels.includes(l));
      if (missingLevels.length) missing.push(`cột ${missingLevels.join("/")}`);
      sheetDiagnostics.push(
        `Sheet "${sheetName}": thiếu ${missing.length ? missing.join(", ") : "dòng tiêu đề hợp lệ"}.`,
      );
      continue;
    }
    const foundCols = cols;

    const loai = sheetName.trim();
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const bacRaw = r[foundCols.bac];
      if (bacRaw === null || bacRaw === undefined || bacRaw === "") continue;
      const lcb = toInt(r[foundCols.lcb]);
      if (lcb <= 0) continue;
      thuTu += 1;
      out.push({
        loai,
        bacLuong: String(bacRaw).trim(),
        lcb,
        a: toInt(r[foundCols.levels["A"] ?? -1]),
        b: toInt(r[foundCols.levels["B"] ?? -1]),
        c: toInt(r[foundCols.levels["C"] ?? -1]),
        d: toInt(r[foundCols.levels["D"] ?? -1]),
        e: toInt(r[foundCols.levels["E"] ?? -1]),
        thuTu,
      });
    }
  }

  if (out.length === 0) {
    throw new ThangLuongParseError(
      sheetDiagnostics.length
        ? `Không đọc được bậc lương nào.\n${sheetDiagnostics.join("\n")}`
        : "Không đọc được bậc lương nào — kiểm tra lại nội dung file.",
    );
  }
  return out;
}

/** Admin: thay TOÀN BỘ bảng thang lương (xoá hết + chèn lại), atomic ở server. */
export async function replaceThangLuong(rows: ThangLuongRow[]): Promise<number> {
  const payload = rows.map((r) => ({
    loai: r.loai,
    bac_luong: r.bacLuong,
    lcb: r.lcb,
    a: r.a,
    b: r.b,
    c: r.c,
    d: r.d,
    e: r.e,
    thu_tu: r.thuTu,
  }));
  const { data, error } = await supabase.rpc("replace_payroll_thang_luong", {
    _rows: payload as unknown as never,
  });
  if (error) throw error;
  return data as number;
}

export async function fetchAllThangLuong(): Promise<ThangLuongRow[]> {
  const { data, error } = await supabase
    .from("payroll_thang_luong")
    .select("*")
    .order("thu_tu", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    loai: r.loai,
    bacLuong: r.bac_luong,
    lcb: r.lcb,
    a: r.a,
    b: r.b,
    c: r.c,
    d: r.d,
    e: r.e,
    thuTu: r.thu_tu,
  }));
}

export interface ThangLuongOptions {
  loai: string;
  bacLuong: string;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

/** Tra cứu đúng 1 dòng khớp CHÍNH XÁC lương cơ bản (LCB) — dùng để tự điền
 *  danh sách lựa chọn "Phụ cấp kỹ năng ABC" giống app gốc. */
export async function fetchThangLuongOptions(lcb: number): Promise<ThangLuongOptions | null> {
  if (!lcb || lcb <= 0) return null;
  const { data, error } = await supabase
    .from("payroll_thang_luong")
    .select("loai, bac_luong, a, b, c, d, e")
    .eq("lcb", lcb)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { loai: data.loai, bacLuong: data.bac_luong, a: data.a, b: data.b, c: data.c, d: data.d, e: data.e };
}
