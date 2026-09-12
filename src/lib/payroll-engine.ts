/**
 * sj_payroll engine — dịch 1:1 từ source Python "SJ_Tinh_Luong" (đã được
 * chính app đó đối chiếu công thức với bản JS gốc `tinhluong.js` và đối
 * chiếu tay bảng chấm công thực tế). File này gộp 5 module gốc:
 *   lunar_calendar.py -> lunar*()
 *   holidays.py       -> getHolidays / classifyDate
 *   shift_schedule.py -> resolveCa
 *   timesheet_calc.py -> aggregateMonth / tinhGioThieuChuyenCan
 *   calc.py           -> tinhLuong / ngayCongChuan
 *
 * QUY TẮC: không được tự ý đổi công thức, hệ số, thứ tự tính hay cách làm
 * tròn so với bản gốc — mọi thay đổi chỉ được là refactor thuần tuý.
 */

// ============================================================================
// 1. Lịch âm Việt Nam (thuật toán Hồ Ngọc Đức, public domain) — lunar_calendar.py
// ============================================================================

const PI = Math.PI;

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd =
    dd +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  if (jd < 2299161) {
    jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  return jd;
}

function jdToDate(jd: number): [number, number, number] {
  let a: number, b: number, c: number;
  if (jd > 2299160) {
    a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = b * 100 + d - 4800 + Math.floor(m / 10);
  return [day, month, year];
}

function newMoon(k: number): number {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  let c1 = (0.1734 - 0.000393 * t) * Math.sin(m * dr) + 0.0021 * Math.sin(2 * dr * m);
  c1 -= 0.4068 * Math.sin(mpr * dr) + 0.0161 * Math.sin(dr * 2 * mpr);
  c1 -= 0.0004 * Math.sin(dr * 3 * mpr);
  c1 += 0.0104 * Math.sin(dr * 2 * f) - 0.0051 * Math.sin(dr * (m + mpr));
  c1 -= 0.0074 * Math.sin(dr * (m - mpr)) + 0.0004 * Math.sin(dr * (2 * f + m));
  c1 -= 0.0004 * Math.sin(dr * (2 * f - m)) - 0.0006 * Math.sin(dr * (2 * f + mpr));
  c1 += 0.001 * Math.sin(dr * (2 * f - mpr)) + 0.0005 * Math.sin(dr * (2 * mpr + m));
  let deltat: number;
  if (t < -11) {
    deltat = 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3;
  } else {
    deltat = -0.000278 + 0.000265 * t + 0.000262 * t2;
  }
  return jd1 + c1 - deltat;
}

function sunLongitude(jdn: number): number {
  const t = (jdn - 2451545.0) / 36525;
  const t2 = t * t;
  const dr = PI / 180;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  let dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m);
  dl += (0.019993 - 0.000101 * t) * Math.sin(dr * 2 * m) + 0.00029 * Math.sin(dr * 3 * m);
  let l = l0 + dl;
  l = l * dr;
  l = l - PI * 2 * Math.floor(l / (PI * 2));
  return l;
}

function getSunLongitude(dayNumber: number, timeZone: number): number {
  return Math.floor((sunLongitude(dayNumber - 0.5 - timeZone / 24.0) / PI) * 6);
}

function getNewMoonDay(k: number, timeZone: number): number {
  return Math.floor(newMoon(k) + 0.5 + timeZone / 24.0);
}

function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  for (;;) {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
    if (arc === last || i >= 14) break;
  }
  return i - 1;
}

/** Trả về [ngày_âm, tháng_âm, năm_âm, có_phải_tháng_nhuận]. */
export function solarToLunar(
  dd: number,
  mm: number,
  yy: number,
  timeZone = 7.0,
): [number, number, number, boolean] {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29.0);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthOff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthOff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthOff) lunarLeap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}

/** Chuyển 1 ngày Âm lịch (VD mùng 1 tháng Giêng) sang ngày Dương lịch (Date | null). */
export function lunarToSolar(
  lunarDay: number,
  lunarMonth: number,
  lunarYear: number,
  lunarLeap = false,
  timeZone = 7.0,
): Date | null {
  let a11: number, b11: number;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone);
    b11 = getLunarMonth11(lunarYear, timeZone);
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone);
    b11 = getLunarMonth11(lunarYear + 1, timeZone);
  }
  let k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) return null;
    if (lunarLeap || off >= leapOff) off += 1;
  }
  k += off;
  const monthStart = getNewMoonDay(k, timeZone);
  const jd = monthStart + lunarDay - 1;
  const [d, m, y] = jdToDate(jd);
  return new Date(Date.UTC(y, m - 1, d));
}

// ============================================================================
// 2. Ngày lễ / Tết Việt Nam — holidays.py
// ============================================================================

export type HolidayKind = "le" | "tet";

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** key "YYYY-MM-DD" -> "le" | "tet", cho 1 năm dương lịch. */
export function getHolidays(year: number): Record<string, HolidayKind> {
  const result: Record<string, HolidayKind> = {};
  result[dateKey(year, 1, 1)] = "le"; // Tết Dương lịch
  result[dateKey(year, 4, 30)] = "le"; // Giải phóng miền Nam
  result[dateKey(year, 5, 1)] = "le"; // Quốc tế Lao động
  result[dateKey(year, 9, 2)] = "le"; // Quốc khánh

  // Giỗ tổ Hùng Vương: mùng 10 tháng 3 âm lịch
  const gioTo = lunarToSolar(10, 3, year);
  if (gioTo) result[dateKey(gioTo.getUTCFullYear(), gioTo.getUTCMonth() + 1, gioTo.getUTCDate())] = "le";

  // Tết Nguyên đán: mùng 1 tháng Giêng âm lịch, mặc định 30 Tết -> mùng 4 Tết
  const mung1 = lunarToSolar(1, 1, year);
  if (mung1) {
    for (let offset = -1; offset <= 3; offset++) {
      const d = new Date(mung1);
      d.setUTCDate(d.getUTCDate() + offset);
      result[dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())] = "tet";
    }
  }
  return result;
}

const holidayCache = new Map<number, Record<string, HolidayKind>>();
function holidaysOfYear(year: number): Record<string, HolidayKind> {
  let h = holidayCache.get(year);
  if (!h) {
    h = getHolidays(year);
    holidayCache.set(year, h);
  }
  return h;
}

/** d: Date (dùng UTC y/m/d làm ngày dương lịch, tránh lệch múi giờ trình duyệt). */
export function classifyDate(d: Date): HolidayKind | null {
  const key = dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return holidaysOfYear(d.getUTCFullYear())[key] ?? null;
}

/** 0=Chủ nhật ... 6=Thứ 7, tương đương Python date.weekday() đã dùng trong bản gốc
 *  (0=Thứ 2 ... 6=Chủ nhật) — hàm dưới trả True nếu là Chủ nhật, dùng thay cho
 *  so sánh weekday() == 6 của bản Python để tránh nhầm lẫn quy ước 2 ngôn ngữ. */
function isSunday(d: Date): boolean {
  return d.getUTCDay() === 0;
}

// ============================================================================
// 3. Suy ra ca ngày/đêm theo mốc 2 tuần — shift_schedule.py
// ============================================================================

export const CA_NGAY = "ngay";
export const CA_DEM = "dem";
export const CA_CHUYEN_NGAY = "chuyen_ngay";
const CYCLE_DAYS = 14;

function otherCa(ca: string): string {
  return ca === CA_NGAY ? CA_DEM : CA_NGAY;
}

function diffDaysUTC(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / MS);
}

export function resolveCa(anchorDate: Date, anchorCa: string, targetDate: Date): string {
  if (anchorCa === CA_CHUYEN_NGAY) return CA_NGAY;
  const diffDays = diffDaysUTC(targetDate, anchorDate);
  // floor-division kiểu Python xử lý đúng cả số âm.
  const periodIndex = Math.floor(diffDays / CYCLE_DAYS);
  if (((periodIndex % 2) + 2) % 2 === 0) return anchorCa;
  return otherCa(anchorCa);
}

// ============================================================================
// 4. Quy đổi bảng chấm công theo ngày -> khoản mục lương — timesheet_calc.py
// ============================================================================

export const PN_MARKER = "PN";
export const NL_MARKER = "NL";

export const RESULT_FIELDS = [
  "ngayCong", "tc150", "tc200", "tcDem30", "ngayCong200", "tc300", "tc340",
  "tcDem70", "thongca380", "phepNam", "le",
  "soGioHanhChinh1", "phuLuongHanhChinh", "soGioTangCa1", "phuLuongTangCa", "soGioDem1", "phuLuongDem",
  "soGioHanhChinh2", "phuLuongHanhChinh2", "soGioTangCa2", "phuLuongTangCa2", "soGioDem2", "phuLuongDem2",
] as const;
export type ResultField = (typeof RESULT_FIELDS)[number];
export type TimesheetAggregate = Record<ResultField, number>;

const NIGHT_SPLIT_HOURS = 4.0;
const NIGHT_ALLOWANCE_BEFORE_CAP = 2.0;
const NIGHT_ALLOWANCE_30_CAP = 6.0;
const NIGHT_ALLOWANCE_70_CAP = 5.0;
const NIGHT_ALLOWANCE_90_CAP = 5.0;
const NIGHT_OT_200_CAP_HOURS = 2.0;

const LE_HANHCHINH_PCT = 300;
const LE_TANGCA_PCT = 450;
const LE_NIGHT_TANGCA_PCT = 510;

export const PN_HALF_DAY_CONG_HOURS = 4.0;

/** ("PN" / "PN 1/2" / "PN 0.5"...) -> [true, số ngày phép]. */
export function isPn(value: unknown): [boolean, number] {
  if (typeof value !== "string") return [false, 0];
  const s = value.trim().toUpperCase();
  if (!s.startsWith(PN_MARKER)) return [false, 0];
  let rest = s.slice(PN_MARKER.length).trim();
  if (!rest) return [true, 1];
  if (rest.startsWith("/")) rest = "1" + rest;
  if (rest.includes("/")) {
    const [num, den] = rest.split("/", 2);
    const n = parseFloat(num ?? "");
    const dd = parseFloat(den ?? "");
    if (!isFinite(n) || !isFinite(dd) || dd === 0) return [true, 1];
    return [true, n / dd];
  }
  const v = parseFloat(rest);
  return [true, isFinite(v) ? v : 1];
}

export function isNl(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === NL_MARKER;
}

function emptyResult(): TimesheetAggregate {
  const r = {} as TimesheetAggregate;
  for (const k of RESULT_FIELDS) r[k] = 0;
  return r;
}

function tetPct(ca: string): number {
  return ca === CA_NGAY ? 500 : 590;
}

/** classifyDate(d), trừ trường hợp ngày lễ CỐ ĐỊNH rơi đúng Chủ nhật (không "stack"). */
function effectiveKind(d: Date): HolidayKind | null {
  const kind = classifyDate(d);
  if (kind === "le" && isSunday(d)) return null;
  return kind;
}

function applyDayShift(d: Date, hc: number, tc: number, tcGg: number, result: TimesheetAggregate): void {
  const kind = effectiveKind(d);
  if (kind === "tet") {
    const pct = tetPct(CA_NGAY);
    result.soGioHanhChinh2 += hc;
    result.phuLuongHanhChinh2 = pct;
    result.soGioTangCa2 += tc + tcGg;
    result.phuLuongTangCa2 = pct;
    return;
  }
  if (kind === "le") {
    result.soGioHanhChinh1 += hc;
    result.phuLuongHanhChinh = LE_HANHCHINH_PCT;
    result.soGioTangCa1 += tc + tcGg;
    result.phuLuongTangCa = LE_TANGCA_PCT;
    return;
  }
  if (isSunday(d)) {
    result.ngayCong200 += hc / 8;
    result.tc300 += tc + tcGg;
    return;
  }
  result.ngayCong += hc / 8;
  result.tc150 += tc + tcGg;
}

function classifyNightPortion(
  d: Date,
  congHours: number,
  allowanceHours: number,
  result: TimesheetAggregate,
): boolean {
  if (congHours <= 0) return false;
  const kind = effectiveKind(d);
  if (kind === "tet") {
    const pct = tetPct(CA_DEM);
    result.soGioHanhChinh2 += congHours;
    result.phuLuongHanhChinh2 = pct;
    result.tcDem70 += Math.min(allowanceHours, NIGHT_ALLOWANCE_90_CAP);
    return true;
  }
  if (kind === "le") {
    result.soGioHanhChinh1 += congHours;
    result.phuLuongHanhChinh = LE_HANHCHINH_PCT;
    result.tcDem70 += Math.min(allowanceHours, NIGHT_ALLOWANCE_90_CAP);
    return true;
  }
  if (isSunday(d)) {
    result.ngayCong200 += congHours / 8;
    result.tcDem70 += Math.min(allowanceHours, NIGHT_ALLOWANCE_70_CAP);
    return true;
  }
  result.ngayCong += congHours / 8;
  result.tcDem30 += Math.min(allowanceHours, NIGHT_ALLOWANCE_30_CAP);
  return false;
}

function applyNightShift(d: Date, hc: number, tc: number, tcGg: number, result: TimesheetAggregate): void {
  const nextD = new Date(d);
  nextD.setUTCDate(nextD.getUTCDate() + 1);

  const phanSauCong = Math.min(hc, NIGHT_SPLIT_HOURS);
  const phanDauCong = Math.max(hc - NIGHT_SPLIT_HOURS, 0);
  const phanDauTc = Math.min(phanDauCong, NIGHT_ALLOWANCE_BEFORE_CAP);
  const phanSauTc = phanSauCong;

  classifyNightPortion(d, phanDauCong, phanDauTc, result);
  const isSpecialSau = classifyNightPortion(nextD, phanSauCong, phanSauTc, result);

  if (isSpecialSau) {
    const tongTc = tc + tcGg;
    const kindNext = effectiveKind(nextD);
    if (kindNext === "tet") {
      result.soGioTangCa2 += tongTc;
      result.phuLuongTangCa2 = tetPct(CA_DEM);
    } else if (kindNext === "le") {
      result.soGioTangCa1 += tongTc;
      result.phuLuongTangCa = LE_NIGHT_TANGCA_PCT;
    } else {
      result.tc340 += tongTc;
    }
  } else {
    const tc200 = Math.min(tc, NIGHT_OT_200_CAP_HOURS) + tcGg;
    const tc150 = Math.max(tc - NIGHT_OT_200_CAP_HOURS, 0);
    result.tc200 += tc200;
    result.tc150 += tc150;
  }
}

export function classifyDay(
  d: Date,
  ca: string,
  gioHanhChinh: number,
  tangCa: number,
  result: TimesheetAggregate,
  tangCaGg = 0,
): void {
  if (gioHanhChinh <= 0 && tangCa <= 0 && tangCaGg <= 0) return;
  if (ca === CA_DEM) applyNightShift(d, gioHanhChinh, tangCa, tangCaGg, result);
  else applyDayShift(d, gioHanhChinh, tangCa, tangCaGg, result);
}

/** 1 ô chấm công: [hc, tc, gg?] — hc có thể là số giờ, hoặc chuỗi "PN"/"PN 1/2"/"NL". */
export type TimesheetCell = [number | string, number, number] | [number | string, number];
export type TimesheetEntries = Record<number, TimesheetCell>;

export function aggregateMonth(
  entries: TimesheetEntries,
  year: number,
  month: number,
  anchorDate: Date | null,
  anchorCa: string,
): TimesheetAggregate {
  const result = emptyResult();
  for (const dayStr of Object.keys(entries)) {
    const day = Number(dayStr);
    const value = entries[day];
    if (!value) continue;
    let hc: number | string, tc: number, gg: number;
    if (value.length >= 3) {
      [hc, tc, gg] = value as [number | string, number, number];
    } else {
      [hc, tc] = value as [number | string, number];
      gg = 0;
    }

    const [pn, pnDays] = isPn(hc);
    if (pn) {
      result.phepNam += pnDays;
      if (pnDays > 0 && pnDays < 1) result.ngayCong += 1 - pnDays;
      continue;
    }
    if (isNl(hc)) {
      result.le += 1;
      continue;
    }

    const hcVal = typeof hc === "number" ? hc : parseFloat(hc || "0");
    const tcVal = typeof tc === "number" ? tc : parseFloat(String(tc || "0"));
    const ggVal = typeof gg === "number" ? gg : parseFloat(String(gg || "0"));
    if (!isFinite(hcVal) || !isFinite(tcVal) || !isFinite(ggVal)) continue;
    if (day < 1 || day > 31) continue;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) continue; // ngày không tồn tại (VD 31/2)

    const ca = anchorDate ? resolveCa(anchorDate, anchorCa, d) : CA_NGAY;
    classifyDay(d, ca, hcVal, tcVal, result, ggVal);
  }

  for (const k of RESULT_FIELDS) {
    result[k] = Math.round(result[k] * 100) / 100;
  }
  return result;
}

/** Tổng số giờ "thiếu công" trong tháng dùng để xét chuyên cần (mục 11). */
export function tinhGioThieuChuyenCan(entries: TimesheetEntries, _year: number, _month: number): number {
  let thieu = 0;
  for (const dayStr of Object.keys(entries)) {
    const value = entries[Number(dayStr)];
    if (!value) continue;
    const hc = value.length >= 1 ? value[0] : 0;
    const [pn] = isPn(hc);
    if (pn || isNl(hc)) continue;
    const hcVal = typeof hc === "number" ? hc : parseFloat(hc || "0");
    if (!isFinite(hcVal)) continue;
    if (hcVal > 0 && hcVal < 8) thieu += 8 - hcVal;
  }
  return Math.round(thieu * 100) / 100;
}

// ============================================================================
// 5. Công thức tính lương — calc.py
// ============================================================================

/** Math.round() của JS đã là "round half away from zero cho số dương" — giữ
 *  nguyên tên jsRound để khớp thuật ngữ bản gốc (bản Python phải tự cài lại
 *  hành vi này vì Python round() dùng banker's rounding, còn JS thì không
 *  cần bọc gì thêm). */
export function jsRound(x: number): number {
  return Math.floor(x + 0.5);
}

/** Tương đương parseNumber() của JS gốc: bỏ dấu chấm, ép về int, lỗi -> 0. */
export function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.trunc(value);
  const s = String(value).replace(/\./g, "").trim();
  if (s === "") return 0;
  const n = parseInt(s, 10);
  return isFinite(n) ? n : 0;
}

/** Tương đương +document.getElementById(id).value (Number()), lỗi -> 0. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const s = String(value).trim();
  if (s === "") return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

export function ngayCongChuan(thang: number, nam: number): number {
  if (thang < 1 || thang > 12) thang = 1;
  const soNgayTrongThang = new Date(Date.UTC(nam, thang, 0)).getUTCDate();
  let soNgayChuNhat = 0;
  for (let d = 1; d <= soNgayTrongThang; d++) {
    if (new Date(Date.UTC(nam, thang - 1, d)).getUTCDay() === 0) soNgayChuNhat++;
  }
  const ngayCong = soNgayTrongThang - soNgayChuNhat;
  return Math.min(ngayCong, 26);
}

export const MONEY_FIELDS = [
  "luongCoBan", "pcABC", "pcChuyenCan", "pcThamNien",
  "pcChucVu", "pcDiLai", "pcDienThoai", "pcTreEm", "pcKhac",
] as const;

export const PHUCAP_FIELDS = [
  "pcABC", "pcChuyenCan", "pcThamNien",
  "pcChucVu", "pcDiLai", "pcDienThoai",
  "pcTreEm", "pcKhac",
] as const;

export interface PayrollInput {
  luongCoBan: string;
  thang: number;
  nam: number;

  ngayCong: number;
  tc150: number;
  tc200: number;
  tcDem30: number;
  ngayCong200: number;
  tc300: number;
  tc340: number;
  tcDem70: number;
  thongca380: number;
  phepNam: number;
  le: number;

  pcABC: string;
  pcChuyenCan: string;
  pcThamNien: string;
  pcChucVu: string;
  pcDiLai: string;
  pcDienThoai: string;
  pcTreEm: string;
  pcKhac: string;

  gioThieuChuyenCan: number;

  soGioHanhChinh1: number;
  phuLuongHanhChinh: number;
  soGioTangCa1: number;
  phuLuongTangCa: number;
  soGioDem1: number;
  phuLuongDem: number;
  soGioHanhChinh2: number;
  phuLuongHanhChinh2: number;
  soGioTangCa2: number;
  phuLuongTangCa2: number;
  soGioDem2: number;
  phuLuongDem2: number;
}

export function emptyPayrollInput(): PayrollInput {
  return {
    luongCoBan: "0",
    thang: 1,
    nam: 2026,
    ngayCong: 0, tc150: 0, tc200: 0, tcDem30: 0, ngayCong200: 0, tc300: 0,
    tc340: 0, tcDem70: 0, thongca380: 0, phepNam: 0, le: 0,
    pcABC: "0", pcChuyenCan: "200000", pcThamNien: "600000", pcChucVu: "0",
    pcDiLai: "500000", pcDienThoai: "0", pcTreEm: "0", pcKhac: "0",
    gioThieuChuyenCan: 0,
    soGioHanhChinh1: 0, phuLuongHanhChinh: 0, soGioTangCa1: 0, phuLuongTangCa: 0,
    soGioDem1: 0, phuLuongDem: 0, soGioHanhChinh2: 0, phuLuongHanhChinh2: 0,
    soGioTangCa2: 0, phuLuongTangCa2: 0, soGioDem2: 0, phuLuongDem2: 0,
  };
}

export interface PayrollResult {
  ngayCongChuan: number;
  tienNgayCong: number;
  tienTC150: number;
  tienTC200: number;
  tienDem30: number;
  tienCong200: number;
  tienTC300: number;
  tienTC340: number;
  tienDem70: number;
  tienthongca380: number;
  tienPhepNam: number;
  tienLe: number;
  tienHanhChinh: number;
  tienTangCa: number;
  tienTroCapDem: number;
  tienHanhChinh2: number;
  tienTangCa2: number;
  tienTroCapDem2: number;
  tienNgayLeTet: number;
  matChuyenCan: boolean;
  tienChuyenCanThucTe: number;
  tongLuong: number;
  tienTruBHXH: number;
  tienTruCD: number;
  thucLinh: number;
}

function calcBangPhu(
  luongNgayCong: number,
  luongTangCa: number,
  _troCapDem: number,
  data: PayrollInput,
  out: PayrollResult,
): number {
  function phuLuong(gio: number, heSo: number, loaiLuong: "hanhChinh" | "tangCa" | "dem"): number {
    gio = toNumber(gio);
    heSo = toNumber(heSo);
    let donGia = 0;
    if (loaiLuong === "hanhChinh" || loaiLuong === "dem") donGia = luongNgayCong / 800;
    else if (loaiLuong === "tangCa") donGia = luongTangCa / 100;
    return jsRound(gio * heSo * donGia);
  }

  out.tienHanhChinh = phuLuong(data.soGioHanhChinh1, data.phuLuongHanhChinh, "hanhChinh");
  out.tienTangCa = phuLuong(data.soGioTangCa1, data.phuLuongTangCa, "tangCa");
  out.tienTroCapDem = phuLuong(data.soGioDem1, data.phuLuongDem, "dem");
  out.tienHanhChinh2 = phuLuong(data.soGioHanhChinh2, data.phuLuongHanhChinh2, "hanhChinh");
  out.tienTangCa2 = phuLuong(data.soGioTangCa2, data.phuLuongTangCa2, "tangCa");
  out.tienTroCapDem2 = phuLuong(data.soGioDem2, data.phuLuongDem2, "dem");

  return (
    out.tienHanhChinh + out.tienTangCa + out.tienTroCapDem +
    out.tienHanhChinh2 + out.tienTangCa2 + out.tienTroCapDem2
  );
}

/** Tương đương tinhLuong() trong tinhluong.js / tinh_luong() trong calc.py. */
export function tinhLuong(data: PayrollInput): PayrollResult {
  const out: PayrollResult = {
    ngayCongChuan: 0, tienNgayCong: 0, tienTC150: 0, tienTC200: 0, tienDem30: 0,
    tienCong200: 0, tienTC300: 0, tienTC340: 0, tienDem70: 0, tienthongca380: 0,
    tienPhepNam: 0, tienLe: 0, tienHanhChinh: 0, tienTangCa: 0, tienTroCapDem: 0,
    tienHanhChinh2: 0, tienTangCa2: 0, tienTroCapDem2: 0, tienNgayLeTet: 0,
    matChuyenCan: false, tienChuyenCanThucTe: 0, tongLuong: 0, tienTruBHXH: 0,
    tienTruCD: 0, thucLinh: 0,
  };

  const luongCoBan = parseNumber(data.luongCoBan);
  const ngayCongChuanVal = ngayCongChuan(Number(data.thang), Number(data.nam));
  out.ngayCongChuan = ngayCongChuanVal;

  const phuCapThamNien = parseNumber(data.pcThamNien);
  const phuCapChucVu = parseNumber(data.pcChucVu);
  const hoTroDiLai = parseNumber(data.pcDiLai);

  const luongNgayCong = ngayCongChuanVal > 0 ? luongCoBan / ngayCongChuanVal : 0;
  const luongTangCa =
    ngayCongChuanVal > 0
      ? (luongCoBan + phuCapThamNien + phuCapChucVu + hoTroDiLai) / ngayCongChuanVal / 8
      : 0;
  const troCapDem = luongTangCa;

  let tong = 0;

  out.tienNgayCong = jsRound(luongNgayCong * toNumber(data.ngayCong));
  tong += out.tienNgayCong;
  out.tienTC150 = jsRound(luongTangCa * 1.5 * toNumber(data.tc150));
  tong += out.tienTC150;
  out.tienTC200 = jsRound(luongTangCa * 2 * toNumber(data.tc200));
  tong += out.tienTC200;
  out.tienDem30 = jsRound(troCapDem * 0.3 * toNumber(data.tcDem30));
  tong += out.tienDem30;
  out.tienCong200 = jsRound(luongNgayCong * 2 * toNumber(data.ngayCong200));
  tong += out.tienCong200;
  out.tienTC300 = jsRound(luongTangCa * 3 * toNumber(data.tc300));
  tong += out.tienTC300;
  out.tienTC340 = jsRound(luongTangCa * 3.4 * toNumber(data.tc340));
  tong += out.tienTC340;
  out.tienDem70 = jsRound(troCapDem * 0.7 * toNumber(data.tcDem70));
  tong += out.tienDem70;
  out.tienthongca380 = jsRound(luongTangCa * 3.8 * toNumber(data.thongca380));
  tong += out.tienthongca380;
  out.tienPhepNam = jsRound(luongNgayCong * toNumber(data.phepNam));
  tong += out.tienPhepNam;
  out.tienLe = jsRound(luongNgayCong * toNumber(data.le));
  tong += out.tienLe;

  const tienNgayLeTet = calcBangPhu(luongNgayCong, luongTangCa, troCapDem, data, out);
  out.tienNgayLeTet = tienNgayLeTet;
  tong += tienNgayLeTet;

  for (const f of PHUCAP_FIELDS) {
    if (f === "pcChuyenCan") continue;
    tong += parseNumber(data[f]);
  }

  out.matChuyenCan = toNumber(data.gioThieuChuyenCan) > 8;
  out.tienChuyenCanThucTe = out.matChuyenCan ? 0 : parseNumber(data.pcChuyenCan);
  tong += out.tienChuyenCanThucTe;

  out.tongLuong = jsRound(tong);

  const luongDongBH = luongCoBan + phuCapThamNien + phuCapChucVu;
  out.tienTruBHXH = jsRound(luongDongBH * 0.105);
  out.tienTruCD = jsRound(luongDongBH * 0.005);

  out.thucLinh = jsRound(tong) - out.tienTruBHXH - out.tienTruCD;

  return out;
}
