// API REST THUẦN cho app desktop "Auto Vạn Kiếp Hùng Ca" (Python) — cùng khuôn với cpk-api-route.ts.
// Toàn bộ là POST + JSON, nằm dưới tiền tố riêng "/api/auto/" nên không đụng route trang web nào.
// Logic nghiệp vụ nằm ở src/lib/auto-auth-core.ts; file này chỉ parse request -> gọi hàm core -> trả JSON.
//
// ============================================================================
// Công khai (không cần đăng nhập)
//   /api/auto/status          {}                         -> { ok, registration_open, contact, server_time }
//   /api/auto/register        { username, password, fp } -> { ok, message } | { ok:false, error }
//   /api/auto/login           { username, password }     -> { ok, role, message, access_token?, refresh_token?, profile?, ... }
//        role = "member" (được dùng, có token) | "disabled" | "pending" | "trial_expired" | "expired" (bị chặn, không token)
//   /api/auto/refresh         { refresh_token }          -> { ok, access_token, refresh_token }   (thành viên lẫn admin)
//
// Thành viên (Header "Authorization: Bearer <access_token>")
//   /api/auto/me              {}                         -> { ok, role, message, profile, server_time, contact }
//   /api/auto/session/acquire { device, host, ver }      -> { ok } | { ok:false, code:"busy", error }
//   /api/auto/session/check   { device, host, ver }      -> { ok, state: "ok" | "kicked" }
//   /api/auto/session/release { device }                 -> { ok }
//   /api/auto/quiz/get        {}                         -> { ok, bank: { câu: đáp án }, count }   (ngân hàng đáp án hỏi đáp dùng chung; admin cũng gọi được)
//   /api/auto/quiz/submit     { entries: { câu: đáp án } } -> { ok, added, count }
//
// Admin (Bearer = access_token của tài khoản admin web; lấy bằng /api/auto/admin/login)
//   /api/auto/admin/login     { email, password }
//   /api/auto/admin/list      {}
//   /api/auto/admin/create    { username, password, days, max_accs, status? }
//   /api/auto/admin/update    { username, status?, max_accs?, deny?, expiry?: { days, extend } }
//   /api/auto/admin/password  { username, password }
//   /api/auto/admin/delete    { username }
//   /api/auto/admin/kick      { username }
//   /api/auto/admin/settings  { registration_open?, contact? }
//   /api/auto/admin/import    { records: [...] }        (nhập users.json cũ của app, chạy 1 lần)
// ============================================================================

import {
  autoPublicStatusCore,
  autoRegisterCore,
  autoLoginCore,
  autoRefreshCore,
  autoMeCore,
  autoSessionAcquireCore,
  autoSessionCheckCore,
  autoSessionReleaseCore,
  autoQuizGetCore,
  autoQuizSubmitCore,
  autoAdminLoginCore,
  autoAdminListCore,
  autoAdminCreateCore,
  autoAdminUpdateCore,
  autoAdminSetPasswordCore,
  autoAdminDeleteCore,
  autoAdminKickCore,
  autoAdminSetSettingsCore,
  autoAdminImportCore,
  type AutoStatus,
  type LegacyRecord,
} from "@/lib/auto-auth-core";

const API_PREFIX = "/api/auto/";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

/** Kết quả {ok:false} -> mã HTTP: lỗi xác thực 401, phiên bận 409, còn lại 400. */
function respond(result: { ok: boolean; code?: string }): Response {
  if (result.ok) return jsonResponse(result, 200);
  return jsonResponse(result, result.code === "auth" ? 401 : result.code === "busy" ? 409 : 400);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

function bearer(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  return (xff.split(",")[0] ?? "").trim() || request.headers.get("x-real-ip") || "";
}

function deviceOf(body: Record<string, unknown>) {
  return { device: str(body["device"]), host: str(body["host"]), ver: str(body["ver"]) };
}

/** Trả Response nếu request thuộc "/api/auto/*", hoặc null nếu không liên quan. */
export async function handleAutoApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return null;

  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST")
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, 405);

  const action = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, "");

  try {
    const body = await readJsonBody(request);
    const token = bearer(request);

    switch (action) {
      case "status":
        return jsonResponse(await autoPublicStatusCore());
      case "register":
        return respond(
          await autoRegisterCore(
            str(body["username"]),
            str(body["password"]),
            str(body["fp"]),
            clientIp(request),
          ),
        );
      case "login":
        return respond(await autoLoginCore(str(body["username"]), str(body["password"])));
      case "refresh":
        return respond(await autoRefreshCore(str(body["refresh_token"])));

      case "me":
        return respond(await autoMeCore(token));
      case "session/acquire":
        return respond(await autoSessionAcquireCore(token, deviceOf(body)));
      case "session/check":
        return respond(await autoSessionCheckCore(token, deviceOf(body)));
      case "session/release":
        return respond(await autoSessionReleaseCore(token, deviceOf(body)));
      case "quiz/get":
        return respond(await autoQuizGetCore(token));
      case "quiz/submit":
        return respond(await autoQuizSubmitCore(token, body["entries"]));

      case "admin/login":
        return respond(await autoAdminLoginCore(str(body["email"]), str(body["password"])));
      case "admin/list":
        return respond(await autoAdminListCore(token));
      case "admin/create":
        return respond(
          await autoAdminCreateCore(token, {
            username: str(body["username"]),
            password: str(body["password"]),
            days: num(body["days"]),
            max_accs: num(body["max_accs"], 2),
            status: (str(body["status"]) || undefined) as AutoStatus | undefined,
          }),
        );
      case "admin/update": {
        const exp = body["expiry"] as { days?: unknown; extend?: unknown } | undefined;
        return respond(
          await autoAdminUpdateCore(token, {
            username: str(body["username"]),
            status: (str(body["status"]) || undefined) as AutoStatus | undefined,
            max_accs:
              typeof body["max_accs"] === "number" ? (body["max_accs"] as number) : undefined,
            deny: Array.isArray(body["deny"])
              ? (body["deny"] as unknown[]).filter((x): x is string => typeof x === "string")
              : undefined,
            expiry:
              exp && typeof exp === "object"
                ? { days: num(exp.days), extend: exp.extend === true }
                : undefined,
          }),
        );
      }
      case "admin/password":
        return respond(
          await autoAdminSetPasswordCore(token, str(body["username"]), str(body["password"])),
        );
      case "admin/delete":
        return respond(await autoAdminDeleteCore(token, str(body["username"])));
      case "admin/kick":
        return respond(await autoAdminKickCore(token, str(body["username"])));
      case "admin/settings":
        return respond(
          await autoAdminSetSettingsCore(token, {
            registration_open:
              typeof body["registration_open"] === "boolean"
                ? (body["registration_open"] as boolean)
                : undefined,
            contact: typeof body["contact"] === "string" ? (body["contact"] as string) : undefined,
            pricing: typeof body["pricing"] === "string" ? (body["pricing"] as string) : undefined,
          }),
        );
      case "admin/import":
        return respond(
          await autoAdminImportCore(
            token,
            (Array.isArray(body["records"]) ? body["records"] : []) as LegacyRecord[],
          ),
        );

      default:
        return jsonResponse({ ok: false, error: "Not Found" }, 404);
    }
  } catch (error) {
    console.error("[auto-api-route]", error);
    const message = error instanceof Error ? error.message : "Lỗi máy chủ không xác định.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
