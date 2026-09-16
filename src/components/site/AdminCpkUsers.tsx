import { useEffect, useState } from "react";
import { Users, KeyRound, Lock, Unlock, Trash2, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  cpkAdminListUsers,
  cpkIsRegistrationEnabled,
  cpkAdminSetRegistrationEnabled,
  type CpkUserRow,
} from "@/lib/cpk-auth-server";
// Đặt lại mật khẩu / Khoá / Xoá là hành động CHUNG cho mọi tài khoản (chỉ thao tác
// theo user id sau khi xác minh caller là admin, không quan tâm tài khoản thuộc app
// nào) nên tái sử dụng thẳng 3 hàm đã có sẵn từ payroll-auth-server.ts, không cần
// viết lại cho CPK - xem docstring trong cpk-auth-server.ts.
import {
  payrollAdminResetPassword as cpkAdminResetPassword,
  payrollAdminSetLocked as cpkAdminSetLocked,
  payrollAdminDeleteUser as cpkAdminDeleteUser,
} from "@/lib/payroll-auth-server";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Quản lý tài khoản người dùng app desktop "CPK Filter Tool". Tên tài khoản hiển
 *  thị ở đây LUÔN có hậu tố "_CPK" (do server tự gắn thêm khi liệt kê - xem
 *  cpk-auth-core.ts) để phân biệt với tài khoản Tính lương/web thường - hậu tố này
 *  CHỈ hiển thị ở đây, người dùng thực tế đăng nhập bằng tên KHÔNG có hậu tố. */
export function AdminCpkUsers() {
  const [users, setUsers] = useState<CpkUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<CpkUserRow | null>(null);
  const [regEnabled, setRegEnabled] = useState<boolean | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function reload() {
    setLoading(true);
    setLoadError(null);
    const token = await getAccessToken();
    if (!token) {
      setLoadError("Không tìm thấy phiên đăng nhập admin.");
      setLoading(false);
      return;
    }
    const res = await cpkAdminListUsers({ data: { access_token: token } });
    if (res.ok) setUsers(res.users);
    else setLoadError(res.error);
    setLoading(false);
  }

  async function reloadRegistrationToggle() {
    const enabled = await cpkIsRegistrationEnabled();
    setRegEnabled(enabled);
  }

  useEffect(() => {
    reload();
    reloadRegistrationToggle();
  }, []);

  async function handleToggleRegistration(next: boolean) {
    const token = await getAccessToken();
    if (!token) return;
    setRegBusy(true);
    const res = await cpkAdminSetRegistrationEnabled({ data: { access_token: token, enabled: next } });
    setRegBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRegEnabled(next);
    toast.success(next ? "Đã BẬT đăng ký tài khoản CPK mới" : "Đã TẮT đăng ký tài khoản CPK mới");
  }

  async function handleToggleLock(u: CpkUserRow) {
    const token = await getAccessToken();
    if (!token) return;
    setBusyId(u.id);
    const res = await cpkAdminSetLocked({ data: { access_token: token, target_user_id: u.id, locked: !u.locked } });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(u.locked ? `Đã mở khoá tài khoản "${u.username}"` : `Đã khoá tài khoản "${u.username}"`);
    reload();
  }

  async function handleDelete(u: CpkUserRow) {
    if (!window.confirm(`Xoá vĩnh viễn tài khoản "${u.username}"?`)) return;
    const token = await getAccessToken();
    if (!token) return;
    setBusyId(u.id);
    const res = await cpkAdminDeleteUser({ data: { access_token: token, target_user_id: u.id } });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Đã xoá tài khoản "${u.username}"`);
    setUsers((list) => list.filter((x) => x.id !== u.id));
  }

  return (
    <div>
      <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <UserPlus className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Cho phép đăng ký tài khoản CPK mới</p>
            <p className="text-xs text-muted-foreground">
              Khi tắt, app "CPK Filter Tool" sẽ từ chối mọi yêu cầu đăng ký tài khoản mới (đăng nhập
              tài khoản đã có vẫn hoạt động bình thường).
            </p>
          </div>
        </div>
        <Switch
          checked={regEnabled ?? false}
          disabled={regEnabled === null || regBusy}
          onCheckedChange={handleToggleRegistration}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} tài khoản CPK Filter Tool</p>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} /> Tải lại
        </Button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="card-surface flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8" />
          Chưa có tài khoản CPK Filter Tool nào đăng ký.
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className={cn("card-surface flex flex-wrap items-center gap-3 p-4", u.locked && "border-destructive/40 bg-destructive/5")}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {u.username}
                  {u.locked && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Đã khoá</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Đăng ký {formatDate(u.createdAt)} · Đăng nhập gần nhất {formatDate(u.lastSignInAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setResetTarget(u)} disabled={busyId === u.id}>
                <KeyRound className="mr-1 h-3.5 w-3.5" /> Đặt lại mật khẩu
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleLock(u)} disabled={busyId === u.id}>
                {u.locked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
                {u.locked ? "Mở khoá" : "Khoá"}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(u)} disabled={busyId === u.id} aria-label="Xoá">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ResetPasswordDialog
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        getAccessToken={getAccessToken}
      />
    </div>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  getAccessToken,
}: {
  user: CpkUserRow | null;
  onClose: () => void;
  getAccessToken: () => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword("");
  }, [user]);

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
    const res = await cpkAdminResetPassword({
      data: { access_token: token, target_user_id: user.id, new_password: password },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Đã đặt lại mật khẩu cho "${user.username}"`);
    onClose();
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu — {user?.username}</DialogTitle>
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
