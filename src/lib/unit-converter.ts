/**
 * Engine chuyển đổi đơn vị cho tab "Công cụ" — thiết kế theo hệ số quy đổi
 * về 1 đơn vị cơ sở cho mỗi nhóm (KHÔNG viết cố định từng cặp), nên thêm
 * đơn vị mới chỉ cần thêm 1 dòng hệ số, không cần viết thêm phép tính.
 * Không làm tròn ở bước tính — chỉ làm tròn lúc hiển thị (formatResult).
 */

export type LengthUnit = "um" | "mm" | "cm" | "m" | "inch" | "mil";
export type AreaUnit = "um2" | "mm2" | "cm2" | "m2" | "inch2";
export type ForceUnit = "N" | "gf" | "kgf";

export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = {
  um: "µm",
  mm: "mm",
  cm: "cm",
  m: "m",
  inch: "inch",
  mil: "mil",
};

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  um2: "µm²",
  mm2: "mm²",
  cm2: "cm²",
  m2: "m²",
  inch2: "inch²",
};

export const FORCE_UNIT_LABELS: Record<ForceUnit, string> = {
  N: "N",
  gf: "gf",
  kgf: "kgf",
};

// Hệ số quy đổi 1 đơn vị -> đơn vị cơ sở (mm / mm² / N).
const LENGTH_TO_MM: Record<LengthUnit, number> = {
  um: 0.001,
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
  mil: 0.0254, // 1 mil = 1/1000 inch
};

const AREA_TO_MM2: Record<AreaUnit, number> = {
  um2: 1e-6,
  mm2: 1,
  cm2: 100,
  m2: 1e6,
  inch2: 645.16, // 25.4²
};

const FORCE_TO_N: Record<ForceUnit, number> = {
  N: 1,
  gf: 0.00980665, // gia tốc trọng trường chuẩn × 0.001kg
  kgf: 9.80665,
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return (value * LENGTH_TO_MM[from]) / LENGTH_TO_MM[to];
}

export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  return (value * AREA_TO_MM2[from]) / AREA_TO_MM2[to];
}

export function convertForce(value: number, from: ForceUnit, to: ForceUnit): number {
  return (value * FORCE_TO_N[from]) / FORCE_TO_N[to];
}

/** Diện tích -> kích thước cạnh tương đương của hình vuông cùng diện tích
 *  (cạnh = căn bậc 2 của diện tích) — KHÔNG phải chuyển đổi đơn vị vật lý
 *  thông thường, chỉ áp dụng cho mục "Diện tích → cạnh tương đương". */
export function areaToEquivalentSide(value: number, areaUnit: AreaUnit, lengthUnit: LengthUnit): number {
  const areaMm2 = value * AREA_TO_MM2[areaUnit];
  if (areaMm2 < 0) return NaN;
  const sideMm = Math.sqrt(areaMm2);
  return sideMm / LENGTH_TO_MM[lengthUnit];
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
