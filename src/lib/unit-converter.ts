/**
 * Engine chuyển đổi đơn vị cho tab "Công cụ".
 *
 * Thiết kế: KHÔNG còn khái niệm "nhóm chuyển đổi" cố định. Mọi đơn vị nằm
 * chung 1 danh sách, người dùng được chọn tự do đơn vị đầu vào / đầu ra bất kỳ
 * (ví dụ chuyển thẳng µm² -> mm). Engine tự nhận diện "loại" (kind) của từng
 * đơn vị để tính cho đúng:
 *  - length <-> length : quy đổi tuyến tính bình thường.
 *  - area   <-> area   : quy đổi tuyến tính bình thường.
 *  - area   -> length  : cạnh tương đương của hình vuông cùng diện tích
 *                        (cạnh = căn bậc 2 của diện tích).
 *  - length -> area    : diện tích hình vuông cạnh bằng chiều dài đó
 *                        (diện tích = cạnh²).
 *  - force  <-> force  : quy đổi tuyến tính bình thường.
 *  - force  <-> length/area (hoặc ngược lại): KHÔNG có ý nghĩa vật lý, engine
 *    trả về null để giao diện báo "không hỗ trợ" thay vì ra số sai.
 *
 * Không làm tròn ở bước tính — chỉ làm tròn lúc hiển thị (formatResult).
 */

export type UnitKind = "length" | "area" | "force";

export type UnitId =
  | "um"
  | "mm"
  | "cm"
  | "m"
  | "inch"
  | "mil"
  | "um2"
  | "mm2"
  | "cm2"
  | "m2"
  | "inch2"
  | "N"
  | "gf"
  | "kgf";

export interface UnitDef {
  id: UnitId;
  label: string;
  kind: UnitKind;
  /** Hệ số quy đổi 1 đơn vị này -> đơn vị cơ sở của kind (mm / mm² / N). */
  toBase: number;
}

export const KIND_LABELS: Record<UnitKind, string> = {
  length: "chiều dài",
  area: "diện tích",
  force: "lực",
};

// Đơn vị cơ sở của mỗi kind: length -> mm, area -> mm², force -> N.
export const UNITS: UnitDef[] = [
  { id: "um", label: "µm", kind: "length", toBase: 0.001 },
  { id: "mm", label: "mm", kind: "length", toBase: 1 },
  { id: "cm", label: "cm", kind: "length", toBase: 10 },
  { id: "m", label: "m", kind: "length", toBase: 1000 },
  { id: "inch", label: "inch", kind: "length", toBase: 25.4 },
  { id: "mil", label: "mil", kind: "length", toBase: 0.0254 }, // 1 mil = 1/1000 inch
  { id: "um2", label: "µm²", kind: "area", toBase: 1e-6 },
  { id: "mm2", label: "mm²", kind: "area", toBase: 1 },
  { id: "cm2", label: "cm²", kind: "area", toBase: 100 },
  { id: "m2", label: "m²", kind: "area", toBase: 1e6 },
  { id: "inch2", label: "inch²", kind: "area", toBase: 645.16 }, // 25.4²
  { id: "N", label: "N", kind: "force", toBase: 1 },
  { id: "gf", label: "gf", kind: "force", toBase: 0.00980665 }, // g chuẩn × 0.001kg
  { id: "kgf", label: "kgf", kind: "force", toBase: 9.80665 },
];

const UNIT_MAP: Record<UnitId, UnitDef> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
) as Record<UnitId, UnitDef>;

export function getUnit(id: UnitId): UnitDef {
  return UNIT_MAP[id];
}

export function unitLabel(id: UnitId): string {
  return UNIT_MAP[id]?.label ?? id;
}

/**
 * Kết quả chuyển đổi tự do giữa 2 đơn vị bất kỳ trong danh sách UNITS.
 * Trả về null nếu cặp đơn vị không có ý nghĩa quy đổi (vd: lực <-> chiều dài).
 */
export function convertFree(value: number, fromId: UnitId, toId: UnitId): number | null {
  const from = UNIT_MAP[fromId];
  const to = UNIT_MAP[toId];
  if (!from || !to || !isFinite(value)) return null;

  // Cùng loại -> quy đổi tuyến tính bình thường.
  if (from.kind === to.kind) {
    return (value * from.toBase) / to.toBase;
  }

  // Diện tích -> chiều dài: cạnh tương đương (cạnh = √diện tích).
  if (from.kind === "area" && to.kind === "length") {
    const areaMm2 = value * from.toBase;
    if (areaMm2 < 0) return NaN;
    const sideMm = Math.sqrt(areaMm2);
    return sideMm / to.toBase;
  }

  // Chiều dài -> diện tích: diện tích hình vuông cạnh = giá trị nhập.
  if (from.kind === "length" && to.kind === "area") {
    const sideMm = value * from.toBase;
    const areaMm2 = sideMm * sideMm;
    return areaMm2 / to.toBase;
  }

  // Lực <-> chiều dài/diện tích: không có ý nghĩa quy đổi.
  return null;
}

/** true nếu cặp đơn vị này có công thức quy đổi hợp lệ (dùng để hiện gợi ý). */
export function isConvertible(fromId: UnitId, toId: UnitId): boolean {
  const from = UNIT_MAP[fromId];
  const to = UNIT_MAP[toId];
  if (!from || !to) return false;
  if (from.kind === to.kind) return true;
  const kinds = [from.kind, to.kind];
  return kinds.includes("length") && kinds.includes("area");
}

/** Bubble Dimension: C = (A + B) / 2, A/B/C đều tính bằng mm. */
export function bubbleDimension(a: number, b: number): number {
  return (a + b) / 2;
}

/** Hiển thị 4 số sau dấu phẩy, chỉ làm tròn ở bước cuối cùng này. */
export function formatResult(value: number): string {
  if (!isFinite(value)) return "—";
  return value.toFixed(4);
}
