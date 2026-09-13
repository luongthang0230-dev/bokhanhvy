import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Trash2, RotateCcw, Info, LogOut, KeyRound, WifiOff, ChevronDown } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePayrollAuth, usePayrollAuthRefresh } from "@/lib/use-payroll-auth";
import { payrollLogin, payrollRegister } from "@/lib/payroll-auth-server";
import { usePwa } from "@/lib/use-pwa";
import { fetchThangLuongOptions, type ThangLuongOptions } from "@/lib/thang-luong-api";
import {
  emptyPayrollInput,
  tinhLuong,
  aggregateMonth,
  tinhGioThieuChuyenCan,
  resolveCa,
  classifyDate,
  parseNumber,
  CA_NGAY,
  CA_DEM,
  CA_CHUYEN_NGAY,
  type PayrollInput,
  type TimesheetEntries,
} from "@/lib/payroll-engine";
import {
  loadSj,
  saveSj,
  addHistory,
  deleteHistoryEntry,
  deleteSj,
  listAllSj,
  type HistoryEntry,
} from "@/lib/payroll-storage";

export const Route = createFileRoute("/tinhluong")({
  component: TinhLuongPage,
});

// ============================================================================
// Helpers
// ============================================================================

function formatMoney(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function unformatMoney(display: string): string {
  const digits = display.replace(/\./g, "").replace(/[^0-9]/g, "");
  return digits === "" ? "0" : String(parseInt(digits, 10));
}

function formatVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
function defaultMonthYear(): { thang: number; nam: number } {
  const today = new Date();
  const d = today.getDate();
  const m = today.getMonth() + 1;
  const y = today.getFullYear();
  const thang = d < 11 ? (m === 1 ? 12 : m - 1) : m;
  const nam = m === 1 && d < 11 ? y - 1 : y;
  return { thang, nam };
}

function monthKeyOf(f: { nam: number; thang: number }) {
  return `${f.nam}-${String(f.thang).padStart(2, "0")}`;
}

// ============================================================================
// Ô nhập tiền tự format dấu chấm (tương đương widgets.py MoneyInput)
// ============================================================================

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? unformatMoney(formatMoney(value)) : formatMoney(value);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        inputMode="numeric"
        value={display}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(unformatMoney(e.target.value))}
        placeholder="0"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          step={step}
          value={value || ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder="0"
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{formatVnd(value)}</span>
    </div>
  );
}

// ============================================================================
// Ô chọn ABC theo thang lương (tra cứu theo LCB) — giống combo động của app gốc
// ============================================================================

function AbcSelect({
  lcbRaw,
  value,
  onChange,
}: {
  lcbRaw: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [options, setOptions] = useState<ThangLuongOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const lcb = parseNumber(lcbRaw);

  useEffect(() => {
    if (!lcb || lcb <= 0) {
      setOptions(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchThangLuongOptions(lcb).then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        setLoading(false);
        if (opts) {
          const validValues = [opts.a, opts.b, opts.c, opts.d, opts.e, 0].map(String);
          // Giữ nguyên lựa chọn cũ nếu vẫn hợp lệ với bậc lương mới, giống
          // hệt hành vi _refresh_pcabc_options() của app gốc — nếu không,
          // mặc định về mốc A.
          if (!validValues.includes(value)) onChange(String(opts.a));
        } else {
          onChange("0");
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcb]);

  const levels: Array<{ letter: string; amount: number }> = options
    ? [
        { letter: "A", amount: options.a },
        { letter: "B", amount: options.b },
        { letter: "C", amount: options.c },
        { letter: "D", amount: options.d },
        { letter: "E", amount: options.e },
      ]
    : [];

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Phụ cấp kỹ năng ABC</Label>
      <Select value={value || "0"} onValueChange={onChange} disabled={!options}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Đang tra cứu..." : "0 (chưa có trong thang lương)"} />
        </SelectTrigger>
        <SelectContent>
          {levels.map((l) => (
            <SelectItem key={l.letter} value={String(l.amount)}>
              {l.letter} - {formatVnd(l.amount)}
            </SelectItem>
          ))}
          <SelectItem value="0">Không áp dụng (0)</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Đang tra cứu..."
          : options
            ? `✅ ${options.loai} — Bậc ${options.bacLuong} (LCB ${formatVnd(lcb)})`
            : lcb
              ? `⚠️ LCB ${formatVnd(lcb)} chưa có trong thang lương — báo admin cập nhật.`
              : "Chưa xác định (chưa nhập LCB)"}
      </p>
    </div>
  );
}

// ============================================================================
// Ô chọn mức phụ cấp cố định (Chuyên cần / Thâm niên / Điện thoại / Trẻ em)
// ============================================================================

function FixedMoneySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: number[];
}) {
  const current = String(parseNumber(value));
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={options.map(String).includes(current) ? current : "0"} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((amount) => (
            <SelectItem key={amount} value={String(amount)}>
              {amount === 0 ? "Không áp dụng (0)" : formatVnd(amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const CHUYEN_CAN_OPTIONS = [0, 200000];
const THAM_NIEN_OPTIONS = [0, 400000, 500000, 600000];
const DIEN_THOAI_OPTIONS = [0, 1500000, 2500000, 3000000, 4000000, 5000000];
const TRE_EM_OPTIONS = [0, 50000, 100000, 150000, 200000];

const WEEKDAY_NAMES = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// ============================================================================
// Form đăng nhập / đăng ký — hiển thị ngay tại trang /tinhluong khi chưa
// đăng nhập, không tách route riêng để tránh lỗi lồng route.
// ============================================================================

const loginFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tên tài khoản tối thiểu 3 ký tự")
    .max(32, "Tên tài khoản tối đa 32 ký tự")
    .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/, "Chỉ gồm chữ, số, dấu . _ -"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
});

function PayrollLoginInline() {
  const refreshAuth = usePayrollAuthRefresh();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginFormSchema.safeParse({ username, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      const fn = mode === "login" ? payrollLogin : payrollRegister;
      const result = await fn({ data: parsed.data });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;
      refreshAuth();
      toast.success(mode === "login" ? `Chào mừng trở lại, ${result.username}` : "Đã tạo tài khoản");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Tính lương</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login" ? "Đăng nhập để tiếp tục" : "Tạo tài khoản mới"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Tên tài khoản</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="vd: ketoan01"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// Trang chính
// ============================================================================

function TinhLuongPage() {
  usePwa();
  const { user, username, isLoading: authLoading } = usePayrollAuth();
  const userId = user?.id ?? null;

  const [maSJ, setMaSJ] = useState("");
  const [loadedSJ, setLoadedSJ] = useState<string | null>(null);
  const [mySjList, setMySjList] = useState<string[]>([]);
  const [form, setForm] = useState<PayrollInput>(() => {
    const base = emptyPayrollInput();
    const { thang, nam } = defaultMonthYear();
    return { ...base, thang, nam };
  });
  const [caConfig, setCaConfig] = useState<{ anchorDate: string | null; anchorCa: string }>({
    anchorDate: null,
    anchorCa: CA_NGAY,
  });
  const [timesheet, setTimesheet] = useState<TimesheetEntries>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState("chamcong");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [changePwOpen, setChangePwOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);
  // Giữ đủ bảng chấm công của TẤT CẢ các tháng đã nhập cho mã SJ đang mở —
  // `timesheet` state ở trên chỉ là tháng đang xem; khi lưu phải gộp lại
  // đầy đủ để không ghi đè mất dữ liệu các tháng khác.
  const allTimesheetsRef = useRef<Record<string, TimesheetEntries>>({});

  useEffect(() => {
    if (!userId) return;
    listAllSj(userId).then(setMySjList);
  }, [userId]);

  // ---- Tính lương ngay khi form đổi (giống "tính lại tức thời" của app gốc)
  const result = useMemo(() => tinhLuong(form), [form]);

  const monthKey = monthKeyOf(form);

  // ---- Load dữ liệu theo mã SJ (từ server, cô lập theo tài khoản)
  async function handleLoadSj(code: string) {
    if (!userId) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    const record = await loadSj(userId, trimmed);
    skipNextSave.current = true;
    allTimesheetsRef.current = record.timesheet;
    setForm(record.config);
    setCaConfig(record.caConfig);
    setTimesheet(record.timesheet[monthKeyOf(record.config)] ?? {});
    setHistory(record.history);
    setLoadedSJ(trimmed);
    setMaSJ(trimmed);
    if (record.fromCache) {
      toast.warning(`Đang mất mạng — hiện bản lưu tạm gần nhất của mã ${trimmed} trên máy này`);
    } else {
      toast.success(`Đã tải dữ liệu mã SJ ${trimmed}`);
      setMySjList((l) => (l.includes(trimmed) ? l : [trimmed, ...l]));
    }
  }

  // ---- Khi đổi tháng/năm trong khi đã tải 1 mã SJ: tải lại bảng chấm công đúng tháng đó
  useEffect(() => {
    if (!loadedSJ || !userId) return;
    setTimesheet(allTimesheetsRef.current[monthKey] ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, loadedSJ, userId]);

  // ---- Tự động lưu LÊN SERVER (debounce ~0.7s sau khi ngừng gõ). Dù mất
  // mạng, hàm saveSj() vẫn ghi cache cục bộ nên dữ liệu không mất — chỉ báo
  // trạng thái "offline" để người dùng biết cần online lại để đồng bộ.
  useEffect(() => {
    if (!loadedSJ || !userId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    allTimesheetsRef.current = { ...allTimesheetsRef.current, [monthKey]: timesheet };
    saveTimer.current = setTimeout(async () => {
      const res = await saveSj(userId, {
        maSJ: loadedSJ,
        config: form,
        caConfig,
        timesheet: allTimesheetsRef.current,
      });
      setSaveState(res.ok ? "saved" : "offline");
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, caConfig, timesheet, loadedSJ, userId]);

  function updateForm<K extends keyof PayrollInput>(k: K, v: PayrollInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSaveHistory() {
    if (!loadedSJ || !userId) {
      toast.error("Nhập và tải mã SJ trước khi lưu lịch sử");
      return;
    }
    const res = await addHistory(userId, loadedSJ, form, result);
    setHistory(res.history);
    if (res.ok) toast.success("Đã lưu vào lịch sử");
    else toast.warning("Mất mạng — đã lưu tạm trên máy này, sẽ cần lưu lại khi có mạng");
  }

  // ---- Bảng chấm công TỰ ĐỘNG quy đổi sang bảng lương — không cần bấm nút
  // gì cả, chỉ cần gõ chấm công, mọi ô liên quan tự cập nhật ngay.
  useEffect(() => {
    const anchorDate = caConfig.anchorDate ? new Date(caConfig.anchorDate + "T00:00:00Z") : null;
    const agg = aggregateMonth(timesheet, form.nam, form.thang, anchorDate, caConfig.anchorCa);
    const gioThieu = tinhGioThieuChuyenCan(timesheet, form.nam, form.thang);
    setForm((f) => ({ ...f, ...agg, gioThieuChuyenCan: gioThieu }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheet, caConfig.anchorDate, caConfig.anchorCa, form.nam, form.thang]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function handleDeleteSj(code: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!userId) return;
    if (!window.confirm(`Xoá vĩnh viễn mã SJ "${code}"? Toàn bộ dữ liệu lương + lịch sử của mã này sẽ mất, không thể hoàn tác.`)) {
      return;
    }
    await deleteSj(userId, code);
    setMySjList((l) => l.filter((c) => c !== code));
    if (loadedSJ === code) {
      setLoadedSJ(null);
      setMaSJ("");
      setForm({ ...emptyPayrollInput(), thang: form.thang, nam: form.nam });
      setHistory([]);
      setTimesheet({});
      allTimesheetsRef.current = {};
    }
    toast.success(`Đã xoá mã SJ "${code}"`);
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 text-sm text-muted-foreground">
          Đang kiểm tra đăng nhập...
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <PayrollLoginInline />
        <Footer />
      </div>
    );
  }

  const phuCapDaCong =
    result.tongLuong -
    result.tienNgayCong -
    result.tienTC150 -
    result.tienTC200 -
    result.tienDem30 -
    result.tienCong200 -
    result.tienTC300 -
    result.tienTC340 -
    result.tienDem70 -
    result.tienthongca380 -
    result.tienPhepNam -
    result.tienLe -
    result.tienNgayLeTet;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Tính lương</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Xin chào, <b className="text-foreground">{username ?? "bạn"}</b>
            </span>
            <Button variant="outline" size="sm" onClick={() => setChangePwOpen(true)}>
              <KeyRound className="mr-1 h-3.5 w-3.5" /> Đổi mật khẩu
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-3.5 w-3.5" /> Đăng xuất
            </Button>
          </div>
        </div>

        {/* Mã SJ */}
        <div className="card-surface mb-6 flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Mã nhân viên (SJ)</Label>
            <Input
              value={maSJ}
              onChange={(e) => setMaSJ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadSj(maSJ)}
              placeholder="VD: 1234"
            />
          </div>
          <Button onClick={() => handleLoadSj(maSJ)}>Tải dữ liệu</Button>
          {mySjList.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Mã đã lưu ({mySjList.length}) <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {mySjList.map((code) => (
                  <DropdownMenuItem
                    key={code}
                    onClick={() => handleLoadSj(code)}
                    className="flex items-center justify-between gap-3"
                  >
                    {code}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSj(code, e)}
                      aria-label={`Xoá mã ${code}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {loadedSJ && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Đang làm việc với mã <b className="text-foreground">{loadedSJ}</b> —{" "}
              {saveState === "saving" && "đang lưu..."}
              {saveState === "saved" && "đã lưu lên server"}
              {saveState === "offline" && (
                <span className="flex items-center gap-1 text-destructive">
                  <WifiOff className="h-3.5 w-3.5" /> mất mạng, đã lưu tạm trên máy
                </span>
              )}
              {saveState === "idle" && "dữ liệu tự lưu lại"}
            </span>
          )}
        </div>

        {!loadedSJ && (
          <div className="card-surface mb-6 flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            Nhập mã SJ và bấm "Tải dữ liệu" để bắt đầu — dữ liệu của bạn sẽ được lưu lên Sever theo tài
            khoản của bạn.
          </div>
        )}

        <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="chamcong">Chấm công</TabsTrigger>
            <TabsTrigger value="luong">Tính lương</TabsTrigger>
            <TabsTrigger value="lichsu">Lịch sử ({history.length})</TabsTrigger>
          </TabsList>

          {/* ================= TAB: CHẤM CÔNG ================= */}
          <TabsContent value="chamcong" className="mt-4">
            <ChamCongTab
              nam={form.nam}
              thang={form.thang}
              onThang={(v) => updateForm("thang", v)}
              onNam={(v) => updateForm("nam", v)}
              ngayCongChuan={result.ngayCongChuan}
              caConfig={caConfig}
              onCaConfig={setCaConfig}
              entries={timesheet}
              onEntries={setTimesheet}
            />
          </TabsContent>

          {/* ================= TAB: TÍNH LƯƠNG ================= */}
          <TabsContent value="luong" className="mt-4 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <section className="card-surface space-y-4 p-4">
                  <h2 className="font-display text-sm font-semibold">Lương cơ bản</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField
                      label="Lương cơ bản"
                      value={form.luongCoBan}
                      onChange={(v) => updateForm("luongCoBan", v)}
                    />
                    <AbcSelect
                      lcbRaw={form.luongCoBan}
                      value={form.pcABC}
                      onChange={(v) => updateForm("pcABC", v)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tháng/năm chấm công và Ngày công chuẩn được chọn ở tab "Chấm công".
                  </p>
                </section>

                <section className="card-surface space-y-3 p-4">
                  <h2 className="font-display text-sm font-semibold">Bảng chính</h2>
                  <div className="space-y-3">
                    <MainRow label="Ngày công (100%)" value={form.ngayCong} onChange={(v) => updateForm("ngayCong", v)} tien={result.tienNgayCong} />
                    <MainRow label="Tăng ca 150%" value={form.tc150} onChange={(v) => updateForm("tc150", v)} tien={result.tienTC150} />
                    <MainRow label="Tăng ca 200%" value={form.tc200} onChange={(v) => updateForm("tc200", v)} tien={result.tienTC200} />
                    <MainRow label="Trợ cấp đêm 30%" value={form.tcDem30} onChange={(v) => updateForm("tcDem30", v)} tien={result.tienDem30} />
                    <MainRow label="Ngày công Chủ nhật 200%" value={form.ngayCong200} onChange={(v) => updateForm("ngayCong200", v)} tien={result.tienCong200} />
                    <MainRow label="Tăng ca Chủ nhật 300%" value={form.tc300} onChange={(v) => updateForm("tc300", v)} tien={result.tienTC300} />
                    <MainRow label="Tăng ca đêm Chủ nhật 340%" value={form.tc340} onChange={(v) => updateForm("tc340", v)} tien={result.tienTC340} />
                    <MainRow label="Trợ cấp đêm 70%" value={form.tcDem70} onChange={(v) => updateForm("tcDem70", v)} tien={result.tienDem70} />
                    <MainRow label="Thông ca 380%" value={form.thongca380} onChange={(v) => updateForm("thongca380", v)} tien={result.tienthongca380} />
                    <MainRow label="Phép năm" value={form.phepNam} onChange={(v) => updateForm("phepNam", v)} tien={result.tienPhepNam} />
                    <MainRow label="Nghỉ lễ hưởng lương" value={form.le} onChange={(v) => updateForm("le", v)} tien={result.tienLe} />
                  </div>
                </section>

                <section className="card-surface space-y-3 p-4">
                  <h2 className="font-display text-sm font-semibold">Bảng phụ — Lương ngày lễ, Tết</h2>
                  <p className="text-xs text-muted-foreground">
                    Tự điền từ bảng chấm công — vẫn có thể sửa tay.
                  </p>
                  <SubShiftRow
                    title="Ca 1"
                    hc={form.soGioHanhChinh1} onHc={(v) => updateForm("soGioHanhChinh1", v)}
                    hcPct={form.phuLuongHanhChinh} onHcPct={(v) => updateForm("phuLuongHanhChinh", v)}
                    tc={form.soGioTangCa1} onTc={(v) => updateForm("soGioTangCa1", v)}
                    tcPct={form.phuLuongTangCa} onTcPct={(v) => updateForm("phuLuongTangCa", v)}
                    dem={form.soGioDem1} onDem={(v) => updateForm("soGioDem1", v)}
                    demPct={form.phuLuongDem} onDemPct={(v) => updateForm("phuLuongDem", v)}
                    tienHc={result.tienHanhChinh} tienTc={result.tienTangCa} tienDem={result.tienTroCapDem}
                  />
                  <SubShiftRow
                    title="Ca 2 (thường dùng cho Tết 500%/590%)"
                    hc={form.soGioHanhChinh2} onHc={(v) => updateForm("soGioHanhChinh2", v)}
                    hcPct={form.phuLuongHanhChinh2} onHcPct={(v) => updateForm("phuLuongHanhChinh2", v)}
                    tc={form.soGioTangCa2} onTc={(v) => updateForm("soGioTangCa2", v)}
                    tcPct={form.phuLuongTangCa2} onTcPct={(v) => updateForm("phuLuongTangCa2", v)}
                    dem={form.soGioDem2} onDem={(v) => updateForm("soGioDem2", v)}
                    demPct={form.phuLuongDem2} onDemPct={(v) => updateForm("phuLuongDem2", v)}
                    tienHc={result.tienHanhChinh2} tienTc={result.tienTangCa2} tienDem={result.tienTroCapDem2}
                  />
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-medium">
                    <span>Tổng bảng phụ</span>
                    <span className="font-mono">{formatVnd(result.tienNgayLeTet)}</span>
                  </div>
                </section>

                <section className="card-surface space-y-3 p-4">
                  <h2 className="font-display text-sm font-semibold">Phụ cấp</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FixedMoneySelect
                        label="Chuyên cần"
                        value={form.pcChuyenCan}
                        onChange={(v) => updateForm("pcChuyenCan", v)}
                        options={CHUYEN_CAN_OPTIONS}
                      />
                      {result.matChuyenCan && (
                        <p className="mt-1 text-xs text-destructive">
                          Mất chuyên cần (thiếu công {'>'} 8 giờ trong tháng)
                        </p>
                      )}
                    </div>
                    <FixedMoneySelect
                      label="Thâm niên"
                      value={form.pcThamNien}
                      onChange={(v) => updateForm("pcThamNien", v)}
                      options={THAM_NIEN_OPTIONS}
                    />
                    <FixedMoneySelect
                      label="Hỗ trợ điện thoại"
                      value={form.pcDienThoai}
                      onChange={(v) => updateForm("pcDienThoai", v)}
                      options={DIEN_THOAI_OPTIONS}
                    />
                    <FixedMoneySelect
                      label="Hỗ trợ trẻ em dưới 6 tuổi"
                      value={form.pcTreEm}
                      onChange={(v) => updateForm("pcTreEm", v)}
                      options={TRE_EM_OPTIONS}
                    />
                    <MoneyField label="Chức vụ" value={form.pcChucVu} onChange={(v) => updateForm("pcChucVu", v)} />
                    <MoneyField label="Đi lại" value={form.pcDiLai} onChange={(v) => updateForm("pcDiLai", v)} />
                    <MoneyField label="Khác" value={form.pcKhac} onChange={(v) => updateForm("pcKhac", v)} />
                  </div>
                  <NumberField
                    label="Giờ thiếu công trong tháng (xét chuyên cần)"
                    value={form.gioThieuChuyenCan}
                    onChange={(v) => updateForm("gioThieuChuyenCan", v)}
                    suffix="giờ"
                    step={0.5}
                  />
                </section>
              </div>

              {/* ---- Kết quả ---- */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <section className="card-surface space-y-1 p-4">
                  <h2 className="mb-2 font-display text-sm font-semibold">Kết quả</h2>
                  <ResultRow label="Ngày công" value={result.tienNgayCong} />
                  <ResultRow label="Tăng ca 150%" value={result.tienTC150} />
                  <ResultRow label="Tăng ca 200%" value={result.tienTC200} />
                  <ResultRow label="Trợ cấp đêm 30%" value={result.tienDem30} />
                  <ResultRow label="Ngày công Chủ nhật" value={result.tienCong200} />
                  <ResultRow label="Tăng ca 300%" value={result.tienTC300} />
                  <ResultRow label="Tăng ca đêm 340%" value={result.tienTC340} />
                  <ResultRow label="Trợ cấp đêm 70%" value={result.tienDem70} />
                  <ResultRow label="Thông ca 380%" value={result.tienthongca380} />
                  <ResultRow label="Phép năm" value={result.tienPhepNam} />
                  <ResultRow label="Nghỉ lễ" value={result.tienLe} />
                  <ResultRow label="Bảng phụ lễ/Tết" value={result.tienNgayLeTet} />
                  <ResultRow label="Phụ cấp (đã cộng)" value={phuCapDaCong} />
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                    <span className="font-semibold">Tổng lương</span>
                    <span className="font-mono text-base font-bold">{formatVnd(result.tongLuong)}</span>
                  </div>
                  <ResultRow label="Trừ BHXH (10.5%)" value={-result.tienTruBHXH} />
                  <ResultRow label="Trừ Công đoàn (0.5%)" value={-result.tienTruCD} />
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5">
                    <span className="font-semibold">Thực lĩnh</span>
                    <span className="font-mono text-lg font-bold text-primary">{formatVnd(result.thucLinh)}</span>
                  </div>
                  <Button className="mt-3 w-full" onClick={handleSaveHistory}>
                    <Save className="mr-1.5 h-4 w-4" /> Lưu vào lịch sử
                  </Button>
                </section>
              </div>
            </div>
          </TabsContent>

          {/* ================= TAB: LỊCH SỬ ================= */}
          <TabsContent value="lichsu" className="mt-4">
            <LichSuTab
              history={history}
              onLoad={(h) => {
                setForm(h.input);
                setTab("luong");
              }}
              onDelete={async (id) => {
                if (!loadedSJ || !userId) return;
                const nextHistory = await deleteHistoryEntry(userId, loadedSJ, id);
                setHistory(nextHistory);
                toast.success("Đã xoá bản ghi lịch sử");
              }}
            />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}

function MainRow({
  label, value, onChange, tien,
}: { label: string; value: number; onChange: (v: number) => void; tien: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
      <span className="text-sm">{label}</span>
      <Input
        type="number"
        step={0.5}
        className="w-24 text-right"
        value={value || ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder="0"
      />
      <span className="w-28 text-right font-mono text-sm text-muted-foreground">{formatVnd(tien)}</span>
    </div>
  );
}

function SubShiftRow(props: {
  title: string;
  hc: number; onHc: (v: number) => void;
  hcPct: number; onHcPct: (v: number) => void;
  tc: number; onTc: (v: number) => void;
  tcPct: number; onTcPct: (v: number) => void;
  dem: number; onDem: (v: number) => void;
  demPct: number; onDemPct: (v: number) => void;
  tienHc: number; tienTc: number; tienDem: number;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{props.title}</p>
      <div className="grid grid-cols-3 gap-3">
        <MiniPair label="Hành chính" gio={props.hc} onGio={props.onHc} pct={props.hcPct} onPct={props.onHcPct} tien={props.tienHc} />
        <MiniPair label="Tăng ca" gio={props.tc} onGio={props.onTc} pct={props.tcPct} onPct={props.onTcPct} tien={props.tienTc} />
        <MiniPair label="Đêm" gio={props.dem} onGio={props.onDem} pct={props.demPct} onPct={props.onDemPct} tien={props.tienDem} />
      </div>
    </div>
  );
}

function MiniPair({
  label, gio, onGio, pct, onPct, tien,
}: { label: string; gio: number; onGio: (v: number) => void; pct: number; onPct: (v: number) => void; tien: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        <Input type="number" step={0.5} className="h-8 text-xs" placeholder="Giờ" value={gio || ""} onChange={(e) => onGio(e.target.value === "" ? 0 : Number(e.target.value))} />
        <Input type="number" step={10} className="h-8 text-xs" placeholder="%" value={pct || ""} onChange={(e) => onPct(e.target.value === "" ? 0 : Number(e.target.value))} />
      </div>
      <p className="text-right font-mono text-[11px] text-muted-foreground">{formatVnd(tien)}</p>
    </div>
  );
}

// ============================================================================
// Tab Chấm công
// ============================================================================

function ChamCongTab({
  nam, thang, onThang, onNam, ngayCongChuan, caConfig, onCaConfig, entries, onEntries,
}: {
  nam: number;
  thang: number;
  onThang: (v: number) => void;
  onNam: (v: number) => void;
  ngayCongChuan: number;
  caConfig: { anchorDate: string | null; anchorCa: string };
  onCaConfig: (c: { anchorDate: string | null; anchorCa: string }) => void;
  entries: TimesheetEntries;
  onEntries: (e: TimesheetEntries) => void;
}) {
  const daysInMonth = new Date(Date.UTC(nam, thang, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  // refs để Enter chuyển ô: input[day][field] với field 0=HC,1=TC,2=GG
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function setCell(day: number, idx: 0 | 1 | 2, raw: string) {
    const cur = entries[day] ?? ["", "", ""];
    const next: [string | number, string | number, string | number] = [
      idx === 0 ? raw : ((cur[0] as string | number) ?? ""),
      idx === 1 ? raw : ((cur[1] as string | number) ?? ""),
      idx === 2 ? raw : ((cur[2] as string | number) ?? ""),
    ];
    onEntries({ ...entries, [day]: next });
  }

  function focusField(day: number, idx: 0 | 1 | 2) {
    inputRefs.current[`${day}-${idx}`]?.focus();
  }

  function handleEnter(day: number, idx: 0 | 1 | 2, dayIndex: number) {
    if (idx < 2) {
      focusField(day, (idx + 1) as 0 | 1 | 2);
    } else {
      const nextDay = days[dayIndex + 1];
      if (nextDay) focusField(nextDay, 0);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card-surface flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tháng</Label>
          <Select value={String(thang)} onValueChange={(v) => onThang(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Năm</Label>
          <Input
            type="number"
            className="w-24"
            value={nam}
            onChange={(e) => onNam(Number(e.target.value) || nam)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ngày công chuẩn</Label>
          <Input value={ngayCongChuan} disabled className="w-24" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ca neo (ngày biết chắc)</Label>
          <Input
            type="date"
            value={caConfig.anchorDate ?? ""}
            onChange={(e) => onCaConfig({ ...caConfig, anchorDate: e.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ca tại ngày neo</Label>
          <Select value={caConfig.anchorCa} onValueChange={(v) => onCaConfig({ ...caConfig, anchorCa: v })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={CA_NGAY}>Ca ngày</SelectItem>
              <SelectItem value={CA_DEM}>Ca đêm</SelectItem>
              <SelectItem value={CA_CHUYEN_NGAY}>Chuyên ca ngày (không đổi ca)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">
          2 tuần đổi ca 1 lần, tính từ ngày thứ 2 tuần đầu đổi ca.
        </p>
      </section>

      <section className="card-surface overflow-x-auto p-4">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-1">Ngày</th>
              <th className="py-2 pr-1">Thứ</th>
              <th className="py-2 pr-2">Ca</th>
              <th className="border-l border-border py-2 pl-2 pr-0.5">Giờ HC</th>
              <th className="py-2 px-0.5">Tăng ca</th>
              <th className="py-2 pl-0.5">TC giữa giờ</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIndex) => {
              const cell = entries[day];
              const hc = cell ? String(cell[0] ?? "") : "";
              const tc = cell ? String(cell[1] ?? "") : "";
              const gg = cell ? String(cell[2] ?? "") : "";
              const d = new Date(Date.UTC(nam, thang - 1, day));
              const ca = caConfig.anchorDate
                ? resolveCa(new Date(caConfig.anchorDate + "T00:00:00Z"), caConfig.anchorCa, d)
                : null;
              const isSunday = d.getUTCDay() === 0;
              const holiday = classifyDate(d);
              const isSpecialDay = isSunday || !!holiday;
              return (
                <tr
                  key={day}
                  className={cn(
                    "border-b border-border/50",
                    isSpecialDay && "bg-destructive/10",
                  )}
                >
                  <td className={cn("py-1 pr-1 font-medium", isSpecialDay && "text-destructive")}>{day}</td>
                  <td className={cn("py-1 pr-1 text-xs", isSpecialDay ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {WEEKDAY_NAMES[d.getUTCDay()]}
                    {holiday === "tet" && " · Tết"}
                    {holiday === "le" && " · Lễ"}
                  </td>
                  <td className="py-1 pr-2 text-xs text-muted-foreground">
                    {ca === CA_DEM ? "Đêm" : ca === CA_NGAY ? "Ngày" : "—"}
                  </td>
                  <td className="border-l border-border py-1 pl-2 pr-0.5">
                    <Input
                      ref={(el) => { inputRefs.current[`${day}-0`] = el; }}
                      className="h-8 w-14 px-1.5 text-xs"
                      value={hc}
                      onChange={(e) => setCell(day, 0, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEnter(day, 0, dayIndex)}
                      placeholder="8"
                    />
                  </td>
                  <td className="py-1 px-0.5">
                    <Input
                      ref={(el) => { inputRefs.current[`${day}-1`] = el; }}
                      className="h-8 w-10 px-1 text-xs"
                      value={tc}
                      onChange={(e) => setCell(day, 1, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEnter(day, 1, dayIndex)}
                    />
                  </td>
                  <td className="py-1 pl-0.5">
                    <Input
                      ref={(el) => { inputRefs.current[`${day}-2`] = el; }}
                      className="h-8 w-10 px-1 text-xs"
                      value={gg}
                      onChange={(e) => setCell(day, 2, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEnter(day, 2, dayIndex)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ============================================================================
// Đổi mật khẩu
// ============================================================================

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    if (password !== confirm) {
      toast.error("Mật khẩu nhập lại không khớp");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Đã đổi mật khẩu");
      onOpenChange(false);
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi mật khẩu thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mật khẩu mới</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Nhập lại mật khẩu mới</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang lưu..." : "Xác nhận"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Tab Lịch sử
// ============================================================================

function LichSuTab({
  history, onLoad, onDelete,
}: { history: HistoryEntry[]; onLoad: (h: HistoryEntry) => void; onDelete: (id: string) => void }) {
  if (history.length === 0) {
    return (
      <div className="card-surface p-10 text-center text-sm text-muted-foreground">
        Chưa có bản ghi lịch sử nào — bấm "Lưu vào lịch sử" ở tab Tính lương để chốt 1 bản ghi.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {history.map((h) => (
        <li key={h.id} className="card-surface flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Tháng {String(h.thang).padStart(2, "0")}/{h.nam} — Thực lĩnh{" "}
              <span className="font-mono">{formatVnd(h.result.thucLinh)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Lưu lúc {new Date(h.savedAt).toLocaleString("vi-VN")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onLoad(h)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Xem lại
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(h.id)} aria-label="Xoá">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
