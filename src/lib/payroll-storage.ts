import { supabase } from "@/integrations/supabase/client";
import type { PayrollInput, PayrollResult, TimesheetEntries } from "./payroll-engine";
import { emptyPayrollInput } from "./payroll-engine";

/**
 * Lưu trữ dữ liệu Tính lương — GIAI ĐOẠN 2: server (Supabase, bảng
 * payroll_sj_records / payroll_history, cô lập theo user_id qua RLS) là
 * nguồn dữ liệu chính, mỗi tài khoản chỉ thấy dữ liệu của chính mình.
 *
 * localStorage vẫn được giữ làm CACHE cục bộ (ghi mỗi lần lưu thành công +
 * đọc tạm khi mất mạng) — đúng yêu cầu "không được để mất/sai dữ liệu khi
 * offline", KHÔNG phải nguồn dữ liệu chính như Giai đoạn 1 nữa.
 */

const CACHE_PREFIX = "sjpayroll:cache:";

export interface CaConfig {
  anchorDate: string | null;
  anchorCa: string;
}

export interface HistoryEntry {
  id: string;
  savedAt: string;
  thang: number;
  nam: number;
  input: PayrollInput;
  result: PayrollResult;
}

export interface SjRecord {
  maSJ: string;
  config: PayrollInput;
  caConfig: CaConfig;
  timesheet: Record<string, TimesheetEntries>;
  history: HistoryEntry[];
  updatedAt: string;
  fromCache?: boolean;
}

function cacheKey(userId: string, maSJ: string): string {
  return `${CACHE_PREFIX}${userId}:${maSJ.trim()}`;
}

function emptyRecord(maSJ: string): SjRecord {
  return {
    maSJ: maSJ.trim(),
    config: emptyPayrollInput(),
    caConfig: { anchorDate: null, anchorCa: "ngay" },
    timesheet: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

function readCache(userId: string, maSJ: string): SjRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId, maSJ));
    return raw ? (JSON.parse(raw) as SjRecord) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, record: SjRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cacheKey(userId, record.maSJ), JSON.stringify(record));
  const listKey = `${CACHE_PREFIX}${userId}:__list`;
  try {
    const list = new Set(JSON.parse(window.localStorage.getItem(listKey) ?? "[]") as string[]);
    list.add(record.maSJ.trim());
    window.localStorage.setItem(listKey, JSON.stringify([...list]));
  } catch {
    window.localStorage.setItem(listKey, JSON.stringify([record.maSJ.trim()]));
  }
}

/** Tải dữ liệu 1 mã SJ từ server; nếu mất mạng/lỗi thì rơi về cache cục bộ
 *  (đánh dấu fromCache=true) thay vì trả về trắng, tránh nhìn nhầm là mất dữ liệu. */
export async function loadSj(userId: string, maSJ: string): Promise<SjRecord> {
  const trimmed = maSJ.trim();
  try {
    const [{ data: rec, error: recErr }, { data: histRows, error: histErr }] = await Promise.all([
      supabase.from("payroll_sj_records").select("*").eq("user_id", userId).eq("ma_sj", trimmed).maybeSingle(),
      supabase
        .from("payroll_history")
        .select("*")
        .eq("user_id", userId)
        .eq("ma_sj", trimmed)
        .order("saved_at", { ascending: false }),
    ]);
    if (recErr) throw recErr;
    if (histErr) throw histErr;

    const result: SjRecord = rec
      ? {
          maSJ: trimmed,
          config: { ...emptyPayrollInput(), ...(rec.config as Partial<PayrollInput>) },
          caConfig: (rec.ca_config as unknown as CaConfig) ?? { anchorDate: null, anchorCa: "ngay" },
          timesheet: (rec.timesheet as unknown as Record<string, TimesheetEntries>) ?? {},
          history: [],
          updatedAt: rec.updated_at,
        }
      : emptyRecord(trimmed);

    result.history = (histRows ?? []).map((h) => ({
      id: h.id,
      savedAt: h.saved_at,
      thang: h.thang,
      nam: h.nam,
      input: h.input as unknown as PayrollInput,
      result: h.result as unknown as PayrollResult,
    }));

    writeCache(userId, result);
    return result;
  } catch {
    const cached = readCache(userId, trimmed);
    if (cached) return { ...cached, fromCache: true };
    return emptyRecord(trimmed);
  }
}

/** Lưu cấu hình + bảng chấm công của 1 mã SJ lên server (upsert). Luôn ghi
 *  cache cục bộ song song, kể cả khi lưu server thất bại — để lần mở lại
 *  (dù chưa có mạng) vẫn thấy đúng bản mới nhất đã nhập. */
export async function saveSj(
  userId: string,
  record: Pick<SjRecord, "maSJ" | "config" | "caConfig" | "timesheet">,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = record.maSJ.trim();
  const cached = readCache(userId, trimmed) ?? emptyRecord(trimmed);
  const nextCache: SjRecord = {
    ...cached,
    maSJ: trimmed,
    config: record.config,
    caConfig: record.caConfig,
    timesheet: record.timesheet,
    updatedAt: new Date().toISOString(),
  };
  writeCache(userId, nextCache);

  try {
    const { error } = await supabase.from("payroll_sj_records").upsert(
      {
        user_id: userId,
        ma_sj: trimmed,
        config: record.config as unknown as never,
        ca_config: record.caConfig as unknown as never,
        timesheet: record.timesheet as unknown as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ma_sj" },
    );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi mạng, đã lưu tạm trên máy này" };
  }
}

export async function addHistory(
  userId: string,
  maSJ: string,
  input: PayrollInput,
  result: PayrollResult,
): Promise<{ ok: boolean; history: HistoryEntry[]; error?: string }> {
  const trimmed = maSJ.trim();
  try {
    const { error } = await supabase.from("payroll_history").insert({
      user_id: userId,
      ma_sj: trimmed,
      thang: Number(input.thang),
      nam: Number(input.nam),
      input: input as unknown as never,
      result: result as unknown as never,
    });
    if (error) throw error;

    const record = await loadSj(userId, trimmed);
    return { ok: true, history: record.history };
  } catch (err) {
    // Không mất bản ghi: lưu tạm vào lịch sử cache cục bộ để không "biến mất".
    const cached = readCache(userId, trimmed) ?? emptyRecord(trimmed);
    const entry: HistoryEntry = {
      id: `local-${Date.now()}`,
      savedAt: new Date().toISOString(),
      thang: Number(input.thang),
      nam: Number(input.nam),
      input,
      result,
    };
    cached.history = [entry, ...cached.history];
    writeCache(userId, cached);
    return {
      ok: false,
      history: cached.history,
      error: err instanceof Error ? err.message : "Lỗi mạng, đã lưu tạm trên máy này",
    };
  }
}

export async function deleteHistoryEntry(userId: string, maSJ: string, entryId: string): Promise<HistoryEntry[]> {
  if (!entryId.startsWith("local-")) {
    await supabase.from("payroll_history").delete().eq("id", entryId).eq("user_id", userId);
  }
  const record = await loadSj(userId, maSJ);
  return record.history;
}

export async function listAllSj(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("payroll_sj_records")
      .select("ma_sj")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.ma_sj);
  } catch {
    try {
      const raw = window.localStorage.getItem(`${CACHE_PREFIX}${userId}:__list`);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
}
