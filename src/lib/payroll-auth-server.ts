// Tài khoản cho app Tính lương — đăng ký bằng "tên tài khoản" (không cần
// email thật). Kỹ thuật: sinh 1 email giả nội bộ "<username>@payroll.local"
// để tận dụng toàn bộ hệ thống Supabase Auth có sẵn (mật khẩu được Supabase
// tự hash an toàn, không lưu plaintext ở đâu cả) — người dùng không bao giờ
// thấy email giả này. Mọi request đều chạy Ở SERVER (không gọi thẳng từ
// trình duyệt sang Supabase), giống hệt lý do đã ghi trong
// admin-auth-server.ts (một số mạng chặn request tới *.supabase.co).
import { createServerFn } from "@tanstack/react-start";

const PAYROLL_EMAIL_DOMAIN = "payroll.local";
const USERNAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/;

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${PAYROLL_EMAIL_DOMAIN}`;
}

function supabaseServerConfig() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("Thiếu biến môi trường SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY trên server.");
  }
  return { url, key };
}

function friendlyAuthError(json: any, status: number): string {
  const raw: string = json?.error_description || json?.msg || json?.error || json?.message || "";
  if (/invalid.*credentials|invalid.*login/i.test(raw)) return "Tên tài khoản hoặc mật khẩu không đúng.";
  if (/already registered|already exists|user_already_exists/i.test(raw))
    return "Tên tài khoản này đã có người dùng, hãy chọn tên khác.";
  if (/banned|locked/i.test(raw)) return "Tài khoản này đang bị khoá, liên hệ quản trị viên.";
  if (status === 429 || /rate.?limit/i.test(raw)) return "Bạn thao tác quá nhanh, hãy đợi một chút rồi thử lại.";
  return raw || `Có lỗi xảy ra (mã ${status}).`;
}

type AuthResult =
  | { ok: true; session: { access_token: string; refresh_token: string }; username: string }
  | { ok: false; error: string };

// ============================================================================
// Đăng ký — dùng Admin API (service role) để tạo thẳng tài khoản đã xác
// thực (email_confirm: true), bỏ qua bước "xác nhận email" (không cần vì
// email là email giả nội bộ, không gửi được).
// ============================================================================
export const payrollRegister = createServerFn({ method: "POST" })
  .validator((d: { username: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const username = data.username.trim();
    if (!USERNAME_RE.test(username)) {
      return {
        ok: false,
        error: "Tên tài khoản 3-32 ký tự, chỉ gồm chữ/số/._- và không bắt đầu bằng ký tự đặc biệt.",
      };
    }
    if (data.password.length < 6) {
      return { ok: false, error: "Mật khẩu tối thiểu 6 ký tự." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = usernameToEmail(username);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { app: "payroll", payroll_username: username },
    });
    if (createErr) {
      const msg = createErr.message ?? "";
      if (/already registered|already exists|duplicate/i.test(msg)) {
        return { ok: false, error: "Tên tài khoản này đã có người dùng, hãy chọn tên khác." };
      }
      return { ok: false, error: msg || "Không tạo được tài khoản." };
    }
    if (!created.user) return { ok: false, error: "Không tạo được tài khoản." };

    // Đăng nhập luôn sau khi tạo, để trả về access_token cho client.
    const { url, key } = supabaseServerConfig();
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({ email, password: data.password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      return { ok: false, error: friendlyAuthError(json, res.status) };
    }
    return {
      ok: true,
      session: { access_token: json.access_token, refresh_token: json.refresh_token },
      username,
    };
  });

// ============================================================================
// Đăng nhập
// ============================================================================
export const payrollLogin = createServerFn({ method: "POST" })
  .validator((d: { username: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const username = data.username.trim();
    const { url, key } = supabaseServerConfig();
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({ email: usernameToEmail(username), password: data.password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      return { ok: false, error: friendlyAuthError(json, res.status) };
    }
    if (json.user?.banned_until && new Date(json.user.banned_until).getTime() > Date.now()) {
      return { ok: false, error: "Tài khoản này đang bị khoá, liên hệ quản trị viên." };
    }
    return {
      ok: true,
      session: { access_token: json.access_token, refresh_token: json.refresh_token },
      username: json.user?.user_metadata?.payroll_username ?? username,
    };
  });

// ============================================================================
// Admin quản lý tài khoản Tính lương — mọi hàm dưới đây tự xác minh caller
// thực sự có quyền admin (qua has_role trong bảng user_roles) TRƯỚC khi làm
// gì, không tin bất kỳ cờ nào gửi từ phía client.
// ============================================================================
async function requireCallerIsAdmin(accessToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData.user) return { ok: false, error: "Phiên đăng nhập không hợp lệ." };
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return { ok: false, error: "Bạn không có quyền admin." };
  return { ok: true };
}

export interface PayrollUserRow {
  id: string;
  username: string;
  createdAt: string;
  lastSignInAt: string | null;
  locked: boolean;
}

export const payrollAdminListUsers = createServerFn({ method: "POST" })
  .validator((d: { access_token: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true; users: PayrollUserRow[] } | { ok: false; error: string }> => {
    const check = await requireCallerIsAdmin(data.access_token);
    if (!check.ok) return check;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const users: PayrollUserRow[] = [];
    let page = 1;
    for (;;) {
      const { data: listRes, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return { ok: false, error: error.message };
      for (const u of listRes.users) {
        if (u.user_metadata?.["app"] !== "payroll") continue;
        users.push({
          id: u.id,
          username: u.user_metadata?.["payroll_username"] ?? u.email ?? u.id,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          locked: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
        });
      }
      if (listRes.users.length < 200) break;
      page += 1;
      if (page > 20) break; // an toàn, tránh vòng lặp vô hạn
    }
    users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ok: true, users };
  });

export const payrollAdminResetPassword = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; target_user_id: string; new_password: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const check = await requireCallerIsAdmin(data.access_token);
    if (!check.ok) return check;
    if (data.new_password.length < 6) return { ok: false, error: "Mật khẩu tối thiểu 6 ký tự." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      password: data.new_password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const payrollAdminSetLocked = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; target_user_id: string; locked: boolean }) => d)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const check = await requireCallerIsAdmin(data.access_token);
    if (!check.ok) return check;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      ban_duration: data.locked ? "876000h" : "none",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const payrollAdminDeleteUser = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; target_user_id: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const check = await requireCallerIsAdmin(data.access_token);
    if (!check.ok) return check;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.target_user_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
