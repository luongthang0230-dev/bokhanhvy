import { useEffect, useMemo, useState } from "react";
import {
  Users,
  KeyRound,
  Trash2,
  RefreshCw,
  UserPlus,
  Settings2,
  CalendarPlus,
  LogOut,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTO_FEATURES,
  AUTO_EXTRAS,
  autoTierOf,
  autoAdminList,
  autoAdminCreate,
  autoAdminUpdate,
  autoAdminSetPassword,
  autoAdminDelete,
  autoAdminKick,
  autoAdminSetSettings,
  type AutoMemberRow,
  type AutoSettings,
  type AutoStatus,
} from "@/lib/auto-auth-server";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<AutoStatus, string> = {
  trial: "Dùng thử",
  active: "Đang hoạt động",
  disabled: "Vô hiệu hóa",
  pending: "Chờ kích hoạt",
};
// Giống EXPIRY_CHOICES / ACC_LIMIT_CHOICES trong app Auto.
const EXPIRY_CHOICES: [string, number][] = [
  ["30 ngày", 30],
  ["60 ngày", 60],
  ["90 ngày", 90],
  ["Vĩnh viễn", 0],
];
const ACC_CHOICES: [string, number][] = [
  ["2 acc", 2],
  ["3 acc", 3],
  ["4 acc", 4],
  ["Không giới hạn", 0],
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function remaining(
  iso: string | null,
  nowMs: number,
): { text: string; tone: "ok" | "soon" | "expired" | "none" } {
  if (!iso) return { text: "Không giới hạn", tone: "none" };
  const left = Date.parse(iso) - nowMs;
  if (left <= 0) return { text: "Đã hết hạn", tone: "expired" };
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const text = d >= 1 ? `${d} ngày ${h} giờ` : h >= 1 ? `${h} giờ ${m} phút` : `${m} phút`;
  return { text: `Còn ${text}`, tone: left < 7 * 86400000 ? "soon" : "ok" };
}

function statusBadge(u: AutoMemberRow, nowMs: number): { label: string; cls: string } {
  const exp = u.expiresAt ? Date.parse(u.expiresAt) : null;
  const expired = exp !== null && exp <= nowMs;
  if (u.status === "disabled")
    return { label: "Vô hiệu hóa", cls: "bg-muted text-muted-foreground" };
  if (u.status === "trial" || u.status === "pending") {
    return expired || !exp
      ? { label: "Hết dùng thử - chờ kích hoạt", cls: "bg-destructive/15 text-destructive" }
      : { label: "Dùng thử", cls: "bg-primary/10 text-primary" };
  }
  return expired
    ? { label: "Hoạt động (hết hạn)", cls: "bg-destructive/15 text-destructive" }
    : { label: "Đang hoạt động", cls: "bg-emerald-500/15 text-emerald-600" };
}

/** Quản lý thành viên app Desktop "Auto Vạn Kiếp Hùng Ca". Mọi tài khoản đăng ký trong app đều vào đây; mọi thay đổi ở
 *  đây (hoặc trong mục Quản lý người dùng của app) dùng chung một cơ sở dữ liệu nên đồng bộ ngay. */
export function AdminAutoUsers() {
  const [users, setUsers] = useState<AutoMemberRow[]>([]);
  const [settings, setSettings] = useState<AutoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);
  const [contact, setContact] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "trial" | "active" | "disabled">("all");
  const [editTarget, setEditTarget] = useState<AutoMemberRow | null>(null);
  const [extendTarget, setExtendTarget] = useState<AutoMemberRow | null>(null);
  const [pwTarget, setPwTarget] = useState<AutoMemberRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function reload(silent = false) {
    if (!silent) setLoading(true);
    setLoadError(null);
    const token = await getAccessToken();
    if (!token) {
      setLoadError("Không tìm thấy phiên đăng nhập admin.");
      setLoading(false);
      return;
    }
    const res = await autoAdminList({ data: { access_token: token } });
    if (res.ok) {
      setUsers(res.members);
      setSettings(res.settings);
      setContact((c) => (silent && c ? c : res.settings.contact));
      setNow(Date.now());
    } else setLoadError(res.error);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    const t = setInterval(() => reload(true), 30000); // giống app: tự làm mới mỗi 30 giây
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings(
    patch: { registration_open?: boolean; contact?: string },
    okMsg: string,
  ) {
    const token = await getAccessToken();
    if (!token) return;
    setRegBusy(true);
    const res = await autoAdminSetSettings({ data: { access_token: token, ...patch } });
    setRegBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSettings(res.settings);
    toast.success(okMsg);
  }

  async function run(
    u: AutoMemberRow,
    fn: (token: string) => Promise<{ ok: boolean; error?: string; message?: string }>,
    okMsg?: string,
  ) {
    const token = await getAccessToken();
    if (!token) return;
    setBusyId(u.id);
    const res = await fn(token);
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error ?? "Có lỗi xảy ra");
      return;
    }
    toast.success(okMsg ?? res.message ?? "Đã lưu");
    reload(true);
  }

  async function handleDelete(u: AutoMemberRow) {
    if (!window.confirm(`Xoá vĩnh viễn thành viên "${u.username}"?`)) return;
    await run(
      u,
      (token) => autoAdminDelete({ data: { access_token: token, username: u.username } }),
      `Đã xoá "${u.username}"`,
    );
  }

  async function handleKick(u: AutoMemberRow) {
    if (
      !window.confirm(
        `Đăng xuất thiết bị đang dùng tài khoản "${u.username}"? Họ có thể đăng nhập lại ngay.`,
      )
    )
      return;
    await run(
      u,
      (token) => autoAdminKick({ data: { access_token: token, username: u.username } }),
      `Đã giải phóng phiên của "${u.username}"`,
    );
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.username.includes(q)) return false;
      if (filter === "trial") return u.status === "trial" || u.status === "pending";
      if (filter === "active") return u.status === "active";
      if (filter === "disabled") return u.status === "disabled";
      return true;
    });
  }, [users, query, filter]);

  return (
    <div>
      <div className="card-surface mb-4 space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-semibold">Cho phép đăng ký tài khoản mới từ app Auto</p>
              <p className="text-xs text-muted-foreground">
                Bật: người dùng bấm "Đăng ký" trong app sẽ được dùng thử 3 ngày. Tắt: app báo chưa
                mở đăng ký (tài khoản đã có vẫn đăng nhập bình thường).
              </p>
            </div>
          </div>
          <Switch
            checked={settings?.registration_open ?? false}
            disabled={!settings || regBusy}
            onCheckedChange={(v) =>
              saveSettings(
                { registration_open: v },
                v ? "Đã MỞ đăng ký tài khoản Auto" : "Đã ĐÓNG đăng ký tài khoản Auto",
              )
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm">Liên hệ admin (hiện trong app khi hết hạn / bị khoá):</Label>
          <Input
            className="max-w-xs"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Zalo: 09xx..."
          />
          <Button
            size="sm"
            variant="outline"
            disabled={regBusy || !settings || contact.trim() === settings.contact}
            onClick={() => saveSettings({ contact: contact.trim() }, "Đã lưu thông tin liên hệ")}
          >
            Lưu
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="w-48 pl-8"
            placeholder="Tìm tài khoản"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border bg-background px-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">Tất cả</option>
          <option value="trial">Dùng thử / chờ kích hoạt</option>
          <option value="active">Đang hoạt động</option>
          <option value="disabled">Vô hiệu hóa</option>
        </select>
        <p className="text-sm text-muted-foreground">
          {shown.length}/{users.length} tài khoản Auto
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Thêm thành viên
          </Button>
          <Button variant="outline" size="sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} /> Tải lại
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
          {/relation .*auto_|auto_members|schema cache/i.test(loadError) && (
            <p className="mt-1 text-xs">
              Có vẻ chưa chạy file AUTO_SETUP.sql trong Supabase → SQL Editor.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card-surface flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8" />
          {users.length === 0
            ? "Chưa có tài khoản Auto nào đăng ký."
            : "Không có tài khoản nào khớp bộ lọc."}
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((u) => {
            const badge = statusBadge(u, now);
            const rem = remaining(u.expiresAt, now);
            return (
              <li
                key={u.id}
                className={cn(
                  "card-surface flex flex-wrap items-center gap-3 p-4",
                  u.status === "disabled" && "opacity-70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {u.username}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.cls)}>
                      {badge.label}
                    </span>
                    {autoTierOf(u.deny) && (
                      <span
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700"
                        title="Gói do Admin gán trong app (mã tier_* trong danh sách quyền)"
                      >
                        Gói {autoTierOf(u.deny)?.label}
                      </span>
                    )}
                    {u.session?.live && (
                      <span
                        className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-600"
                        title={`Thiết bị: ${u.session.host ?? "?"} · app v${u.session.ver ?? "?"}`}
                      >
                        Đang online{u.session.host ? ` · ${u.session.host}` : ""}
                      </span>
                    )}
                    {!u.migrated && (
                      <span
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        title="Thành viên cũ nhập từ app; sẽ tự chuyển sang web khi họ đăng nhập lần đầu"
                      >
                        Chưa chuyển
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.maxAccs ? `${u.maxAccs} acc` : "Không giới hạn acc"} · Đăng ký{" "}
                    {formatDate(u.createdAt)} · Hết hạn {formatDate(u.expiresAt)}{" "}
                    <span
                      className={cn(
                        rem.tone === "expired" && "text-destructive",
                        rem.tone === "soon" && "text-orange-600",
                      )}
                    >
                      ({rem.text})
                    </span>{" "}
                    · Đăng nhập gần nhất {formatDate(u.lastLoginAt)}
                    {u.deny.filter((x) => !x.startsWith("grant_") && !x.startsWith("tier_")).length > 0 && (
                      <>
                        {" "}
                        · Khoá {u.deny.filter((x) => !x.startsWith("grant_") && !x.startsWith("tier_")).length} tính năng
                      </>
                    )}
                    {u.deny.includes("grant_autosell") && <> · VIP tự bán</>}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditTarget(u)}
                  disabled={busyId === u.id}
                >
                  <Settings2 className="mr-1 h-3.5 w-3.5" /> Cài đặt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExtendTarget(u)}
                  disabled={busyId === u.id}
                >
                  <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Gia hạn
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPwTarget(u)}
                  disabled={busyId === u.id}
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Đổi MK
                </Button>
                {u.session && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleKick(u)}
                    disabled={busyId === u.id}
                    title="Giải phóng phiên đăng nhập (máy treo / mất máy)"
                  >
                    <LogOut className="mr-1 h-3.5 w-3.5" /> Đăng xuất TB
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(u)}
                  disabled={busyId === u.id}
                  aria-label="Xoá"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <EditDialog
        user={editTarget}
        onClose={() => setEditTarget(null)}
        getAccessToken={getAccessToken}
        onSaved={() => reload(true)}
      />
      <ExtendDialog
        user={extendTarget}
        onClose={() => setExtendTarget(null)}
        getAccessToken={getAccessToken}
        onSaved={() => reload(true)}
      />
      <PasswordDialog
        user={pwTarget}
        onClose={() => setPwTarget(null)}
        getAccessToken={getAccessToken}
      />
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        getAccessToken={getAccessToken}
        onSaved={() => reload(true)}
      />
    </div>
  );
}

type TokenFn = () => Promise<string | null>;

function Select({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: [string, number][];
}) {
  return (
    <select
      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map(([label, v]) => (
        <option key={label} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Cài đặt tài khoản: trạng thái, số acc, quyền từng tính năng (giống UserDialog trong app). */
function EditDialog({
  user,
  onClose,
  getAccessToken,
  onSaved,
}: {
  user: AutoMemberRow | null;
  onClose: () => void;
  getAccessToken: TokenFn;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AutoStatus>("active");
  const [maxAccs, setMaxAccs] = useState(2);
  const [deny, setDeny] = useState<string[]>([]);
  const [resetExp, setResetExp] = useState(false);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setStatus(user.status === "pending" ? "trial" : user.status);
    setMaxAccs(user.maxAccs);
    setDeny(user.deny);
    setResetExp(false);
    setDays(30);
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    const res = await autoAdminUpdate({
      data: {
        access_token: token,
        input: {
          username: user.username,
          status,
          max_accs: maxAccs,
          deny,
          ...(resetExp ? { expiry: { days, extend: false } } : {}),
        },
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Đã lưu "${user.username}"`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cài đặt tài khoản — {user?.username}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Trạng thái</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as AutoStatus)}
              >
                {(["trial", "active", "disabled"] as AutoStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Số acc game được mở</Label>
              <Select value={maxAccs} onChange={setMaxAccs} options={ACC_CHOICES} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="reset-exp"
              checked={resetExp}
              onCheckedChange={(v) => setResetExp(v === true)}
            />
            <Label htmlFor="reset-exp" className="text-sm">
              Đặt lại thời hạn (tính từ hôm nay):
            </Label>
            <div className="w-36">
              <Select value={days} onChange={setDays} options={EXPIRY_CHOICES} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Quyền sử dụng tính năng (bỏ tick = khoá)</p>
            {autoTierOf(deny) && (
              <p className="mb-2 text-xs text-muted-foreground">
                Gói hiện tại: <b>{autoTierOf(deny)?.label}</b> — gán / đổi gói trong app Admin (Quản lý thành viên → Cài đặt TK). Lưu ở đây vẫn giữ nguyên gói.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AUTO_FEATURES.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!deny.includes(f.key)}
                    onCheckedChange={(v) =>
                      setDeny((d) => (v === true ? d.filter((x) => x !== f.key) : [...d, f.key]))
                    }
                  />
                  {f.label}
                </label>
              ))}
              {AUTO_EXTRAS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <Checkbox
                    checked={deny.includes(f.key)}
                    onCheckedChange={(v) =>
                      setDeny((d) => (v === true ? [...d.filter((x) => x !== f.key), f.key] : d.filter((x) => x !== f.key)))
                    }
                  />
                  {f.label} (cấp quyền = tick)
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang lưu..." : "Lưu"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({
  user,
  onClose,
  getAccessToken,
  onSaved,
}: {
  user: AutoMemberRow | null;
  onClose: () => void;
  getAccessToken: TokenFn;
  onSaved: () => void;
}) {
  const [days, setDays] = useState(30);
  const [extend, setExtend] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDays(30);
    setExtend(true);
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    const res = await autoAdminUpdate({
      data: { access_token: token, input: { username: user.username, expiry: { days, extend } } },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message);
    onSaved();
    onClose();
  }
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gia hạn — {user?.username}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Hiện tại: {user?.expiresAt ? `hết hạn ${formatDate(user.expiresAt)}` : "Không giới hạn"}
          </p>
          <Select value={days} onChange={setDays} options={EXPIRY_CHOICES} />
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={extend} onChange={() => setExtend(true)} /> Cộng thêm vào
            hạn còn lại (gia hạn)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={!extend} onChange={() => setExtend(false)} /> Tính lại từ
            hôm nay
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang lưu..." : "Áp dụng"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  user,
  onClose,
  getAccessToken,
}: {
  user: AutoMemberRow | null;
  onClose: () => void;
  getAccessToken: TokenFn;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPassword(""), [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    const res = await autoAdminSetPassword({
      data: { access_token: token, username: user.username, password },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Đã đổi mật khẩu cho "${user.username}"`);
    onClose();
  }
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu — {user?.username}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="text"
            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang lưu..." : "Xác nhận"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({
  open,
  onClose,
  getAccessToken,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  getAccessToken: TokenFn;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [maxAccs, setMaxAccs] = useState(2);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setDays(30);
      setMaxAccs(2);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    const res = await autoAdminCreate({
      data: { access_token: token, input: { username, password, days, max_accs: maxAccs } },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message);
    onSaved();
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Thêm thành viên Auto</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            placeholder="Tên đăng nhập (3-32 ký tự: chữ, số, . _ -)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <Input
            type="text"
            placeholder="Mật khẩu (≥ 6 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select value={days} onChange={setDays} options={EXPIRY_CHOICES} />
            <Select value={maxAccs} onChange={setMaxAccs} options={ACC_CHOICES} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang tạo..." : "Thêm"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
