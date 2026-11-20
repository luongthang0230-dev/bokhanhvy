// VÒNG QUAY NHÂN PHẨM — route xử lý cho "/api/auto/spin/*" và "/api/auto/admin/spin/*".
// Mọi luật nằm trong SQL (vong_quay.sql). File này chỉ: xác thực -> gọi RPC -> trả JSON.
// Được gọi từ src/lib/auto-api-route.ts (handleAutoApiRequest).
//
//  Thành viên (Bearer access_token thành viên):
//    POST /api/auto/spin/state   body {}                      -> trạng thái + 16 ô + kết quả (xem được cả khi đã quay)
//    POST /api/auto/spin/draw    body {"platform":"pc"}       -> quay (máy chủ bốc giải)
//  Admin (Bearer access_token admin):
//    POST /api/auto/admin/spin/draw     body {}  -> admin quay thử KHÔNG GIỚI HẠN (bốc đúng tỉ lệ, không ghi lịch sử, không tính lượt / vé)
//    POST /api/auto/admin/spin/config   body {} = đọc; {"spinDay":25,"openDays":0,"activeFrom":"2026-11-25","enabled":true} = đổi
//    POST /api/auto/admin/spin/grant    body {"user":"abc","count":1,"note":"..."}   -> cấp vé quay thủ công
//    POST /api/auto/admin/spin/results  body {"user":"abc"(tuỳ chọn),"limit":100}    -> lịch sử trúng thưởng
//    POST /api/auto/admin/spin/claim    body {"id":123,"claimed":true}               -> đánh dấu đã trao thưởng
//    POST /api/auto/admin/spin/delete   body {"ids":[1,2]} | {"all":true,"user":"abc"(tuỳ chọn)} -> xoá (ẩn) dòng lịch sử; KHÔNG mở lại lượt quay

import { autoSpinMemberUser, autoSpinAdminName } from "@/lib/auto-auth-core";

async function getSb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Các hàm lucky_spin_* chưa có trong types.ts (file sinh tự động) nên dùng client không gắn kiểu.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

type Out = { status: number; body: Record<string, unknown> };

const bad = (status: number, error: string, extra: object = {}): Out => ({
  status,
  body: { ok: false, error, ...extra },
});

/** Các action thuộc vòng quay (dùng trong switch của auto-api-route.ts). */
export const SPIN_ACTIONS = [
  "spin/state",
  "spin/draw",
  "admin/spin/draw",
  "admin/spin/config",
  "admin/spin/grant",
  "admin/spin/results",
  "admin/spin/claim",
  "admin/spin/delete",
] as const;

export async function handleSpin(
  action: string,
  token: string,
  body: Record<string, unknown>,
): Promise<Out> {
  const sb = await getSb();

  // ---------- thành viên ----------
  if (action === "spin/state" || action === "spin/draw") {
    const user = await autoSpinMemberUser(token);
    if (!user) return bad(401, "Phiên đăng nhập hết hạn.", { code: "auth" });

    if (action === "spin/state") {
      const { data, error } = await sb.rpc("lucky_spin_state", { p_user: user });
      if (error) return bad(500, "Lỗi máy chủ: " + error.message);
      return { status: 200, body: data }; // data đã có ok:true
    }

    const platform = String(body["platform"] ?? "").toLowerCase();
    const { data, error } = await sb.rpc("lucky_spin_draw", { p_user: user, p_platform: platform });
    if (error) return bad(500, "Lỗi máy chủ: " + error.message);
    return { status: 200, body: data }; // ok:false (đã quay / chưa tới kỳ...) vẫn trả 200 + message tiếng Việt
  }

  // ---------- admin ----------
  if (action.startsWith("admin/spin/")) {
    const admin = await autoSpinAdminName(token);
    if (!admin) return bad(401, "Cần đăng nhập admin.", { code: "auth" });
    const op = action.slice("admin/spin/".length);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let r: any;

    if (op === "draw") {
      r = await sb.rpc("lucky_spin_admin_draw");
    } else if (op === "config") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = {};
      if (body && typeof body === "object") {
        if ("enabled" in body) p.enabled = !!body["enabled"];
        if ("spinDay" in body)
          p.spinDay = Math.min(31, Math.max(1, Math.trunc(Number(body["spinDay"])) || 25));
        if ("openDays" in body)
          p.openDays = Math.min(31, Math.max(0, Math.trunc(Number(body["openDays"])) || 0));
        if ("activeFrom" in body)
          p.activeFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body["activeFrom"] || ""))
            ? String(body["activeFrom"])
            : "";
      }
      r = await sb.rpc("lucky_spin_admin_config", { p });
    } else if (op === "grant") {
      r = await sb.rpc("lucky_spin_admin_grant", {
        p_user: String(body["user"] || ""),
        p_by: admin,
        p_note: body["note"] ?? null,
        p_count: Number(body["count"]) || 1,
      });
    } else if (op === "results") {
      r = await sb.rpc("lucky_spin_admin_results", {
        p_user: body["user"] ?? null,
        p_limit: Number(body["limit"]) || 100,
      });
    } else if (op === "claim") {
      r = await sb.rpc("lucky_spin_admin_claim", {
        p_id: Number(body["id"]),
        p_claimed: body["claimed"] !== false,
      });
    } else if (op === "delete") {
      const ids = (Array.isArray(body["ids"]) ? body["ids"] : [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);
      r = await sb.rpc("lucky_spin_admin_delete", {
        p_ids: ids.length ? ids : null,
        p_all: body["all"] === true,
        p_user: body["user"] ? String(body["user"]) : null,
      });
    } else return bad(404, "Không có chức năng này.");

    if (r.error) return bad(500, "Lỗi máy chủ: " + r.error.message);
    return { status: 200, body: r.data };
  }

  return bad(404, "Không có chức năng này.");
}
