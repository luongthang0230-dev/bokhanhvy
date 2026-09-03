// Đăng nhập/đăng ký admin được thực hiện Ở PHÍA SERVER (server function của
// TanStack Start, chạy trong Vercel serverless function), KHÔNG gọi thẳng từ
// trình duyệt sang Supabase. Lý do: một số mạng/tường lửa (mạng công ty,
// mạng doanh nghiệp, ISP...) chặn hoặc treo request POST trực tiếp từ trình
// duyệt tới *.supabase.co dù GET vẫn qua được — máy chủ Vercel không bị ảnh
// hưởng bởi mạng cục bộ của người dùng nên luôn kết nối được.
import { createServerFn } from "@tanstack/react-start";

type AuthResult =
  | { ok: true; session: { access_token: string; refresh_token: string } }
  | { ok: true; needsConfirmation: true }
  | { ok: false; error: string };

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
  if (/invalid.*credentials|invalid.*login/i.test(raw)) return "Email hoặc mật khẩu không đúng.";
  if (/already registered|already exists|user_already_exists/i.test(raw)) return "Email này đã có tài khoản. Hãy đăng nhập.";
  if (status === 429 || /rate.?limit/i.test(raw)) return "Bạn thao tác quá nhanh, hãy đợi một chút rồi thử lại.";
  return raw || `Có lỗi xảy ra (mã ${status}).`;
}

export const serverSignIn = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { url, key } = supabaseServerConfig();
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      return { ok: false, error: friendlyAuthError(json, res.status) };
    }
    return {
      ok: true,
      session: { access_token: json.access_token, refresh_token: json.refresh_token },
    };
  });

export const serverSignUp = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { url, key } = supabaseServerConfig();
    const res = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: friendlyAuthError(json, res.status) };
    }
    if (json.access_token) {
      return {
        ok: true,
        session: { access_token: json.access_token, refresh_token: json.refresh_token },
      };
    }
    // Email confirmation vẫn đang bật trên Supabase — không có session ngay.
    return { ok: true, needsConfirmation: true };
  });

// Xác minh phiên đăng nhập + quyền admin Ở PHÍA SERVER (thay cho
// supabase.auth.getUser() + query user_roles chạy trực tiếp từ trình duyệt),
// vì cùng lý do như trên: tránh mọi request trực tiếp trình duyệt → Supabase.
export const serverCheckAdmin = createServerFn({ method: "POST" })
  .validator((d: { access_token: string }) => d)
  .handler(async ({ data }): Promise<{ user: { id: string; email?: string } | null; isAdmin: boolean }> => {
    const { url, key } = supabaseServerConfig();
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${data.access_token}` },
    });
    if (!userRes.ok) return { user: null, isAdmin: false };
    const user = await userRes.json();
    if (!user?.id) return { user: null, isAdmin: false };

    const rolesRes = await fetch(`${url}/rest/v1/user_roles?select=role&user_id=eq.${user.id}`, {
      headers: { apikey: key, Authorization: `Bearer ${data.access_token}` },
    });
    const roles = rolesRes.ok ? await rolesRes.json().catch(() => []) : [];
    const isAdmin = Array.isArray(roles) && roles.some((r: { role: string }) => r.role === "admin");
    return { user: { id: user.id, email: user.email }, isAdmin };
  });
