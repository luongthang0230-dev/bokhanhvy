import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { usePayrollAuth, usePayrollAuthRefresh } from "@/lib/use-payroll-auth";
import { payrollLogin, payrollRegister } from "@/lib/payroll-auth-server";
import { usePwa } from "@/lib/use-pwa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const formSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tên tài khoản tối thiểu 3 ký tự")
    .max(32, "Tên tài khoản tối đa 32 ký tự")
    .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/, "Chỉ gồm chữ, số, dấu . _ -"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
});

export const Route = createFileRoute("/tinhluong/login")({
  head: () => ({ meta: [{ title: "Đăng nhập Tính lương" }] }),
  component: PayrollLoginPage,
});

function PayrollLoginPage() {
  usePwa();
  const navigate = useNavigate();
  const { user, isLoading } = usePayrollAuth();
  const refreshAuth = usePayrollAuthRefresh();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && user) navigate({ to: "/tinhluong" });
  }, [isLoading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse({ username, password });
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
      navigate({ to: "/tinhluong" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
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
