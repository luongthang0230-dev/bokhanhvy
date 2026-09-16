// API REST THUẦN cho app desktop "CPK Filter Tool" (Python/Tkinter) - KHÔNG dùng cơ
// chế RPC nội bộ của TanStack Start (createServerFn) vì cơ chế đó chỉ dành cho code
// chạy trong chính app React/trình duyệt. Đây là các endpoint HTTP JSON thông thường,
// gọi được từ bất kỳ HTTP client nào (Python urllib/requests, curl, Postman...).
//
// Được gắn vào src/server.ts - CHẶN request TRƯỚC KHI giao cho TanStack Start xử lý,
// nên các đường dẫn dưới đây phải khác hoàn toàn với mọi route trang web hiện có
// (tất cả đều nằm dưới tiền tố riêng "/api/cpk/").
//
// Toàn bộ logic nghiệp vụ thực tế nằm ở src/lib/cpk-auth-core.ts - file này CHỈ làm
// nhiệm vụ: parse HTTP request -> gọi hàm core tương ứng -> trả JSON Response.
//
// ============================================================================
// DANH SÁCH ENDPOINT (dùng cho app desktop, xem app/update/... phía Python để biết
// cách gọi thực tế - toàn bộ đều nhận/trả JSON, đều là POST):
//
//   POST /api/cpk/registration-status  (no body)
//        -> { ok: true, enabled: boolean }
//
//   POST /api/cpk/register   { username, password }
//        -> { ok: true, access_token, refresh_token, username } | { ok: false, error }
//
//   POST /api/cpk/login      { username, password }
//        -> giống hệt register
//
//   POST /api/cpk/refresh    { refresh_token }
//        -> giống hệt register (dùng cho "Tự động đăng nhập" - làm mới access_token
//           đã hết hạn mà không cần người dùng nhập lại mật khẩu)
//
//   POST /api/cpk/logout     Header "Authorization: Bearer <access_token>"
//        -> { ok: true } | { ok: false, error }
// ============================================================================

import {
  cpkRegisterCore,
  cpkLoginCore,
  cpkRefreshCore,
  cpkLogoutCore,
  cpkIsRegistrationEnabledCore,
} from "@/lib/cpk-auth-core";

const API_PREFIX = "/api/cpk/";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Trả về Response nếu request này thuộc "/api/cpk/*" (đã xử lý xong), hoặc null nếu
 * không liên quan (để src/server.ts giao tiếp cho TanStack Start xử lý như bình thường).
 */
export async function handleCpkApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const action = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, "");

  try {
    if (action === "registration-status") {
      const enabled = await cpkIsRegistrationEnabledCore();
      return jsonResponse({ ok: true, enabled });
    }

    if (action === "register") {
      const body = await readJsonBody(request);
      const result = await cpkRegisterCore(asString(body["username"]), asString(body["password"]));
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (action === "login") {
      const body = await readJsonBody(request);
      const result = await cpkLoginCore(asString(body["username"]), asString(body["password"]));
      return jsonResponse(result, result.ok ? 200 : 401);
    }

    if (action === "refresh") {
      const body = await readJsonBody(request);
      const result = await cpkRefreshCore(asString(body["refresh_token"]));
      return jsonResponse(result, result.ok ? 200 : 401);
    }

    if (action === "logout") {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
      if (!token) return jsonResponse({ ok: false, error: "Thiếu access token." }, 401);
      const result = await cpkLogoutCore(token);
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    return jsonResponse({ ok: false, error: "Not Found" }, 404);
  } catch (error) {
    console.error("[cpk-api-route]", error);
    const message = error instanceof Error ? error.message : "Lỗi máy chủ không xác định.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
