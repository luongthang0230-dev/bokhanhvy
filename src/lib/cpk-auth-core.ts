// Tài khoản cho app Desktop "CPK Filter Tool" — ĐĂNG KÝ VÀO CHUNG hệ thống
// Supabase Auth đã có sẵn (giống hệt cơ chế app Tính lương ở payroll-auth-server.ts),
// chỉ khác domain email giả nội bộ ("cpk.local" thay vì "payroll.local") để 2 app
// không đụng username của nhau, và user_metadata.app = "cpk" để phân biệt khi
// admin liệt kê tài khoản.
//
// KHÁC VỚI payroll-auth-server.ts: các hàm ở đây là HÀM THUẦN (không bọc
// createServerFn) vì được gọi từ 2 nơi khác nhau:
//   1) src/server.ts — route REST thuần "/api/cpk/*" để app desktop (Python/Tkinter,
//      không phải trình duyệt) gọi trực tiếp bằng HTTP JSON, không thể dùng cơ chế
//      RPC nội bộ của createServerFn (vốn chỉ dành cho code chạy trong chính app React).
//   2) src/lib/cpk-auth-server.ts — bọc lại bằng createServerFn cho trang Admin
//      (chạy trong trình duyệt) dùng để liệt kê tài khoản CPK.
//
// Luôn `await import("@/integrations/supabase/client.server")` ở TRONG từng hàm
// (không import ở đầu file) — giữ đúng quy ước bảo mật đã có sẵn trong dự án để
// SUPABASE_SERVICE_ROLE_KEY không bao giờ lọt vào bundle gửi cho trình duyệt.

const CPK_EMAIL_DOMAIN = "cpk.local";
const USERNAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/;

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${CPK_EMAIL_DOMAIN}`;
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
  if (/refresh.*token|invalid.*refresh/i.test(raw)) return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
  if (status === 429 || /rate.?limit/i.test(raw)) return "Bạn thao tác quá nhanh, hãy đợi một chút rồi thử lại.";
  return raw || `Có lỗi xảy ra (mã ${status}).`;
}

export type CpkAuthResult =
  | { ok: true; access_token: string; refresh_token: string; username: string }
  | { ok: false; error: string };

// ============================================================================
// Bật/tắt đăng ký tài khoản mới — đọc/ghi bảng public.cpk_settings (xem migration
// 20260916070000_cpk_settings.sql). Mặc định BẬT nếu vì lý do gì đó chưa có dòng
// cấu hình trong DB (an toàn - không khoá tính năng ngoài ý muốn do lỗi migration).
// ============================================================================
export async function cpkIsRegistrationEnabledCore(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("cpk_settings")
    .select("value")
    .eq("key", "registration_enabled")
    .maybeSingle();
  if (error || !data) return true;
  return data.value !== false;
}

export async function cpkAdminSetRegistrationEnabledCore(
  accessToken: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("cpk_settings")
    .upsert({ key: "registration_enabled", value: enabled, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================================
// Đăng ký — dùng Admin API (service role) để tạo thẳng tài khoản đã xác thực
// (email_confirm: true, bỏ qua bước gửi email xác nhận vì email là email giả
// nội bộ, không gửi được và cũng không cần thiết).
// ============================================================================
export async function cpkRegisterCore(username: string, password: string): Promise<CpkAuthResult> {
  if (!(await cpkIsRegistrationEnabledCore())) {
    return { ok: false, error: "Tính năng đăng ký tài khoản mới hiện đang tắt. Vui lòng liên hệ quản trị viên." };
  }

  const cleanUsername = username.trim();
  if (!USERNAME_RE.test(cleanUsername)) {
    return {
      ok: false,
      error: "Tên tài khoản 3-32 ký tự, chỉ gồm chữ/số/._- và không bắt đầu bằng ký tự đặc biệt.",
    };
  }
  if (password.length < 6) {
    return { ok: false, error: "Mật khẩu tối thiểu 6 ký tự." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = usernameToEmail(cleanUsername);

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { app: "cpk", cpk_username: cleanUsername },
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    if (/already registered|already exists|duplicate/i.test(msg)) {
      return { ok: false, error: "Tên tài khoản này đã có người dùng, hãy chọn tên khác." };
    }
    return { ok: false, error: msg || "Không tạo được tài khoản." };
  }
  if (!created.user) return { ok: false, error: "Không tạo được tài khoản." };

  // Đăng nhập luôn sau khi tạo, để trả về access_token/refresh_token cho app desktop.
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    return { ok: false, error: friendlyAuthError(json, res.status) };
  }
  return {
    ok: true,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    username: cleanUsername,
  };
}

// ============================================================================
// Đăng nhập
// ============================================================================
export async function cpkLoginCore(username: string, password: string): Promise<CpkAuthResult> {
  const cleanUsername = username.trim();
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ email: usernameToEmail(cleanUsername), password }),
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
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    username: json.user?.user_metadata?.cpk_username ?? cleanUsername,
  };
}

// ============================================================================
// Làm mới phiên đăng nhập bằng refresh_token — dùng cho tính năng "Tự động đăng
// nhập" của app desktop (access_token của Supabase chỉ sống ~1 giờ, app cần tự
// làm mới bằng refresh_token đã lưu cục bộ mà KHÔNG bắt người dùng nhập lại
// mật khẩu mỗi lần mở app).
// ============================================================================
export async function cpkRefreshCore(refreshToken: string): Promise<CpkAuthResult> {
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ refresh_token: refreshToken }),
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
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    username: json.user?.user_metadata?.cpk_username ?? "",
  };
}

// ============================================================================
// Đăng xuất - thu hồi refresh token phía Supabase (best-effort; app desktop vẫn
// luôn tự xoá token đã lưu cục bộ ngay cả khi lệnh này lỗi/mất mạng).
// ============================================================================
export async function cpkLogoutCore(accessToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 401) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: friendlyAuthError(json, res.status) };
  }
  return { ok: true };
}

// ============================================================================
// Admin — liệt kê tài khoản app CPK. Trường "username" trả về ĐÃ GẮN SẴN hậu tố
// "_CPK" (chỉ hiển thị ở trang quản lý của admin - yêu cầu gốc: "phần này chỉ
// trong trang quản lý của admin mới hiển thị, còn người dùng vẫn sử dụng bình
// thường"), vì hàm này CHỈ được trang Admin gọi để hiển thị danh sách, không
// dùng cho bất kỳ mục đích nào khác (đăng nhập của người dùng vẫn luôn dùng tên
// gốc không có hậu tố, xem cpkLoginCore ở trên).
// ============================================================================
export interface CpkUserRow {
  id: string;
  username: string;
  createdAt: string;
  lastSignInAt: string | null;
  locked: boolean;
}

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

export async function cpkAdminListUsersCore(
  accessToken: string,
): Promise<{ ok: true; users: CpkUserRow[] } | { ok: false; error: string }> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const users: CpkUserRow[] = [];
  let page = 1;
  for (;;) {
    const { data: listRes, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { ok: false, error: error.message };
    for (const u of listRes.users) {
      if (u.user_metadata?.["app"] !== "cpk") continue;
      const baseUsername: string = u.user_metadata?.["cpk_username"] ?? u.email ?? u.id;
      users.push({
        id: u.id,
        username: `${baseUsername}_CPK`, // Hậu tố CHỈ để hiển thị trong trang Admin (xem docstring trên).
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
}
