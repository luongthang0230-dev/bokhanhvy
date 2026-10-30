// Thành viên app Desktop "Auto Vạn Kiếp Hùng Ca" — đăng ký / đăng nhập / quản lý / 1 thiết bị mỗi tài khoản.
//
// Thay cho kho GitHub (data/users.json, sessions/*.json) mà app dùng trước đây. Dùng cùng khuôn với
// cpk-auth-core.ts: tài khoản đăng nhập thật nằm trong Supabase Auth (email giả "<username>@auto.local",
// user_metadata.app = "auto"), còn dữ liệu riêng của Auto (trạng thái, hạn dùng, số acc, quyền tính năng,
// phiên thiết bị) nằm trong các bảng auto_* (xem supabase/migrations/20261014000000_auto_members.sql).
//
// Các hàm ở đây là HÀM THUẦN (không bọc createServerFn) vì được gọi từ 2 nơi:
//   1) src/lib/auto-api-route.ts — REST "/api/auto/*" cho app desktop (Python, không phải trình duyệt).
//   2) src/lib/auto-auth-server.ts — bọc createServerFn cho tab "Người dùng Auto" ở trang Admin.
//
// Luôn `await import("@/integrations/supabase/client.server")` Ở TRONG từng hàm (không import đầu file) để
// SUPABASE_SERVICE_ROLE_KEY không bao giờ lọt vào bundle gửi cho trình duyệt.

export const AUTO_EMAIL_DOMAIN = "auto.local";
export const AUTO_USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
export const AUTO_TRIAL_DAYS = 3;
export const AUTO_MIN_PW = 6;
export const AUTO_SESSION_TTL_S = 720; // phiên quá 12 phút không có nhịp "còn sống" = hết hạn, máy khác mới được vào
export const AUTO_HB_EVERY_S = 60; // ghi nhịp tối đa mỗi 60 giây (app hỏi thường xuyên hơn nhưng không ghi dày)
const MAX_TRIALS_PER_IP_PER_DAY = 5;
const MAX_LEGACY_ITERS = 2_000_000;

/** Khớp FEATURES trong app/auth.py — tính năng admin có thể khoá cho từng thành viên. */
export const AUTO_FEATURES = [
  { key: "quest", label: "Nhiệm vụ" },
  { key: "dungeon", label: "Phó bản" },
  { key: "train", label: "Train quái" },
  { key: "gather", label: "Nhặt nguyên liệu" },
  { key: "pk", label: "Chế độ PK / săn người chơi" },
  { key: "hp", label: "Tự bơm HP" },
  { key: "mp", label: "Tự bơm Mana" },
  { key: "remember_train", label: "Ghi nhớ map train & quay lại bãi" },
  { key: "fly_pill", label: "Ưu tiên Khinh Công Đan" },
  { key: "skip_boss", label: "Bỏ qua nhiệm vụ đánh Boss" },
  { key: "hide", label: "Ẩn nhân vật / Ẩn auto (ẩn cửa sổ game, ẩn xuống khay)" },
] as const;
/** Quyền "cộng thêm" (mặc định TẮT): có token trong mảng deny = được cấp. Khớp EXTRAS trong app/auth.py. */
export const AUTO_EXTRAS = [{ key: "grant_autosell", label: "VIP: Tự bán đồ + Né boss khi nhặt (tab Nhặt)" }] as const;
const FEATURE_KEYS: string[] = [...AUTO_FEATURES.map((f) => f.key), ...AUTO_EXTRAS.map((f) => f.key)];

/**
 * GÓI (name tag): app admin gán gói cho thành viên bằng 1 MÃ nằm trong mảng `deny` (không có cột riêng).
 * Khớp TIERS / TIER_TOKEN trong app/auth.py. Thứ tự THẤP → CAO.
 */
export const AUTO_TIERS = [
  { key: "nongdan", token: "tier_nongdan", label: "Nông dân" },
  { key: "nhagiau", token: "tier_nhagiau", label: "Nhà giàu" },
  { key: "daigia", token: "tier_daigia", label: "Đại gia" },
  // Gói VIP (gói thứ 4): full tính năng, 30 ngày (admin đặt hạn), không giới hạn nhân vật. Phải là gói CUỐI (cao nhất) trong danh sách này.
  { key: "vip", token: "tier_vip", label: "VIP" },
] as const;
const TIER_TOKENS: string[] = AUTO_TIERS.map((t) => t.token);

/** Gói (cao nhất) của 1 mảng deny; null = chưa phân gói. */
export function autoTierOf(deny: readonly string[] | null | undefined) {
  const d = new Set(deny ?? []);
  return [...AUTO_TIERS].reverse().find((t) => d.has(t.token)) ?? null;
}

/**
 * MỘT bộ lọc `deny` duy nhất cho MỌI nơi: ghi (admin/update, admin/create, nhập), đọc (admin/list) và dựng hồ sơ trả cho
 * thành viên (login, me). Giữ: tên tính năng hợp lệ + mã gói tier_*. Có nhiều mã gói thì chỉ giữ gói CAO NHẤT (app cũng lấy gói cao nhất).
 * Mọi thứ khác (chuỗi lạ, không phải chuỗi) bị bỏ. Đừng tự lọc deny ở chỗ khác - sót 1 nơi là gói mất ở nơi đó.
 */
export function cleanDeny(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const x of input) {
    if (typeof x === "string" && (FEATURE_KEYS.includes(x) || TIER_TOKENS.includes(x))) out.add(x);
  }
  const top = [...TIER_TOKENS].reverse().find((k) => out.has(k));
  for (const k of TIER_TOKENS) if (k !== top) out.delete(k);
  return [...out].sort();
}

export type AutoStatus = "trial" | "active" | "disabled" | "pending";
const STATUSES: string[] = ["trial", "active", "disabled", "pending"];

/** Kết quả đánh giá 1 tài khoản: "member" = được dùng; còn lại = bị chặn kèm lý do. */
export type AutoRole = "member" | "disabled" | "pending" | "trial_expired" | "expired";

export interface AutoProfile {
  status: AutoStatus;
  /** Mốc hết hạn (giây epoch) hoặc null = không giới hạn. */
  expires: number | null;
  /** Số acc game được mở; 0 = không giới hạn. */
  max_accs: number;
  deny: string[];
}

interface MemberDb {
  id: string;
  user_id: string | null;
  username: string;
  status: AutoStatus;
  expires_at: string | null;
  max_accs: number;
  deny: string[] | null;
  legacy_salt: string | null;
  legacy_iter: number | null;
  legacy_hash: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface AutoMemberRow {
  id: string;
  username: string;
  status: AutoStatus;
  expiresAt: string | null;
  maxAccs: number;
  deny: string[];
  createdAt: string;
  lastLoginAt: string | null;
  /** false = thành viên cũ nhập từ app, chưa đăng nhập lần nào kể từ khi chuyển lên web. */
  migrated: boolean;
  /** Phiên từng nền tảng (tối đa 1 "pc" + 1 "android"). */
  sessions: AutoSessionInfo[];
  /** Phiên có nhịp mới nhất (giữ cho tương thích). */
  session: AutoSessionInfo | null;
}

export interface AutoSessionInfo {
  platform: "pc" | "android";
  device: string;
  host: string | null;
  ver: string | null;
  hb: string;
  live: boolean;
}

export interface AutoSettings {
  registration_open: boolean;
  contact: string;
  /** Bảng giá do admin soạn trong app (chuỗi JSON). Lưu NGUYÊN VĂN, app tự đọc. Rỗng = app dùng ảnh bảng giá mặc định. */
  pricing: string;
  /** Đường dẫn cập nhật app do admin điền. Rỗng = mặc định của app. */
  update_url: string;
  /** Ảnh QR thanh toán (base64). Chỉ trả trong login + admin settings (ảnh nặng, không đưa vào me / status). Rỗng = ảnh mặc định. */
  pay_qr: string;
}

// Giới hạn kích thước cài đặt do admin lưu (quá giới hạn thì BÁO LỖI, không cắt ngầm: app so sánh từng ký tự để biết đã lưu đúng chưa).
const AUTO_PRICING_MAX = 200000;
const AUTO_UPDATE_URL_MAX = 500;
const AUTO_PAY_QR_MAX = 1500000;

type Fail = { ok: false; error: string; code?: "auth" | "busy" };
type Ok<T> = { ok: true } & T;

export type AutoLoginResult =
  | Ok<{
      role: AutoRole;
      message: string;
      access_token?: string;
      refresh_token?: string;
      profile?: AutoProfile;
      server_time: number;
      contact: string;
      pricing: string;
      update_url: string;
      pay_qr: string;
    }>
  | Fail;

export type AutoTokenResult =
  Ok<{ access_token: string; refresh_token: string; email: string }> | Fail;

// ---------------------------------------------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------------------------------------------
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Các bảng auto_* chưa có trong types.ts (file sinh tự động) nên dùng client không gắn kiểu.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTO_EMAIL_DOMAIN}`;
}

function normUser(u: unknown): string {
  return (typeof u === "string" ? u : "").trim().toLowerCase();
}

function nowS(): number {
  return Math.floor(Date.now() / 1000);
}

function supabaseServerConfig() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("Thiếu biến môi trường SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY trên server.");
  }
  return { url, key };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function friendlyAuthError(json: any, status: number): string {
  const raw: string = json?.error_description || json?.msg || json?.error || json?.message || "";
  if (/invalid.*credentials|invalid.*login/i.test(raw)) return "Sai tài khoản hoặc mật khẩu.";
  if (/already registered|already exists|user_already_exists/i.test(raw))
    return "Tên đăng nhập này đã tồn tại.";
  if (/refresh.*token|invalid.*refresh/i.test(raw))
    return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
  if (status === 429 || /rate.?limit/i.test(raw))
    return "Thao tác quá nhanh, hãy đợi một chút rồi thử lại.";
  return raw || `Có lỗi xảy ra (mã ${status}).`;
}

function isoOrNull(sec: number | null): string | null {
  return sec == null ? null : new Date(sec * 1000).toISOString();
}

function expiresSec(m: MemberDb): number | null {
  if (!m.expires_at) return null;
  const t = Date.parse(m.expires_at);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function profileOf(m: MemberDb): AutoProfile {
  return {
    status: m.status,
    expires: expiresSec(m),
    max_accs: Number.isFinite(m.max_accs) ? m.max_accs : 2,
    deny: cleanDeny(m.deny),
  };
}

async function getSettingsCore(): Promise<AutoSettings> {
  const sb = await db();
  const { data } = await sb.from("auto_settings").select("key,value");
  const map = new Map<string, unknown>(
    (data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
  );
  return {
    registration_open: map.get("registration_open") === true, // mặc định ĐÓNG (giống app cũ)
    contact: typeof map.get("contact") === "string" ? (map.get("contact") as string) : "",
    pricing: typeof map.get("pricing") === "string" ? (map.get("pricing") as string) : "",
    update_url: typeof map.get("update_url") === "string" ? (map.get("update_url") as string) : "",
    pay_qr: typeof map.get("pay_qr") === "string" ? (map.get("pay_qr") as string) : "",
  };
}

/** Đánh giá trạng thái dùng được của 1 tài khoản (giống hàm login_ex trong app/auth.py). */
function evaluate(m: MemberDb, contact: string): { role: AutoRole; message: string } {
  const lien = contact ? `\nLiên hệ Admin: ${contact}` : "";
  const exp = expiresSec(m);
  const now = nowS();
  if (m.status === "disabled")
    return { role: "disabled", message: "Tài khoản đã bị Admin vô hiệu hóa." + lien };
  if (m.status === "pending")
    return { role: "pending", message: "Tài khoản đang CHỜ ADMIN KÍCH HOẠT." + lien };
  if (m.status === "trial") {
    if (!exp || now >= exp) {
      return {
        role: "trial_expired",
        message:
          `Bạn đã sử dụng hết ${AUTO_TRIAL_DAYS} ngày dùng thử, liên hệ Admin để được kích hoạt.` +
          lien,
      };
    }
    return { role: "member", message: "" };
  }
  if (exp && now >= exp) {
    return {
      role: "expired",
      message: "Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ admin để gia hạn." + lien,
    };
  }
  return { role: "member", message: "" };
}

async function findMember(username: string): Promise<MemberDb | null> {
  const sb = await db();
  const { data } = await sb.from("auto_members").select("*").eq("username", username).maybeSingle();
  return (data as MemberDb | null) ?? null;
}

async function passwordGrant(email: string, password: string) {
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function createAuthUser(
  username: string,
  password: string,
): Promise<{ ok: true; id: string } | Fail> {
  const sb = await db();
  const { data, error } = await sb.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { app: "auto", auto_username: username },
  });
  if (error) {
    const msg: string = error.message ?? "";
    if (/already registered|already exists|duplicate/i.test(msg)) {
      return { ok: false, error: "Tên đăng nhập này đã tồn tại." };
    }
    return { ok: false, error: msg || "Không tạo được tài khoản." };
  }
  if (!data?.user) return { ok: false, error: "Không tạo được tài khoản." };
  return { ok: true, id: data.user.id as string };
}

async function verifyLegacy(m: MemberDb, password: string): Promise<boolean> {
  if (!m.legacy_salt || !m.legacy_hash) return false;
  const iters = m.legacy_iter ?? 200000;
  if (!Number.isInteger(iters) || iters < 1 || iters > MAX_LEGACY_ITERS) return false;
  const { pbkdf2, timingSafeEqual } = await import("node:crypto");
  const got: Buffer = await new Promise((resolve, reject) =>
    pbkdf2(
      Buffer.from(password, "utf8"),
      Buffer.from(m.legacy_salt as string, "hex"),
      iters,
      32,
      "sha256",
      (e, k) => (e ? reject(e) : resolve(k)),
    ),
  );
  const want = Buffer.from(m.legacy_hash, "hex");
  return want.length === got.length && timingSafeEqual(got, want);
}

// ---------------------------------------------------------------------------------------------------------------
// Công khai: trạng thái đăng ký / đăng ký / đăng nhập / làm mới
// ---------------------------------------------------------------------------------------------------------------
export async function autoPublicStatusCore(): Promise<
  Ok<{
    registration_open: boolean;
    contact: string;
    pricing: string;
    update_url: string;
    server_time: number;
  }>
> {
  const s = await getSettingsCore();
  return {
    ok: true,
    registration_open: s.registration_open,
    contact: s.contact,
    pricing: s.pricing,
    update_url: s.update_url,
    server_time: nowS(),
  };
}

export async function autoRegisterCore(
  usernameRaw: string,
  password: string,
  fp: string,
  ip: string,
): Promise<Ok<{ message: string }> | Fail> {
  const settings = await getSettingsCore();
  if (!settings.registration_open) {
    return {
      ok: false,
      error:
        "Hiện chưa mở đăng ký tài khoản mới." +
        (settings.contact ? `\nLiên hệ Admin để được cấp tài khoản: ${settings.contact}` : ""),
    };
  }
  const username = normUser(usernameRaw);
  if (!AUTO_USERNAME_RE.test(username))
    return { ok: false, error: "Tên đăng nhập 3-32 ký tự: chữ, số, dấu . _ -" };
  if (username === "admin") return { ok: false, error: "Không được dùng tên 'admin'." };
  if (password.length < AUTO_MIN_PW)
    return { ok: false, error: `Mật khẩu tối thiểu ${AUTO_MIN_PW} ký tự.` };
  if (!/^[a-f0-9]{16,64}$/i.test(fp))
    return { ok: false, error: "Phiên bản app quá cũ, hãy cập nhật app rồi đăng ký lại." };

  const sb = await db();
  if (await findMember(username)) return { ok: false, error: "Tên đăng nhập này đã tồn tại." };

  const lien = settings.contact ? `\nLiên hệ Admin để được kích hoạt: ${settings.contact}` : "";
  const { data: usedFp } = await sb
    .from("auto_trials")
    .select("fp")
    .eq("fp", fp.toLowerCase())
    .maybeSingle();
  if (usedFp) return { ok: false, error: "Máy này đã dùng thử rồi." + lien };

  if (ip) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb
      .from("auto_trials")
      .select("fp", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_TRIALS_PER_IP_PER_DAY) {
      return {
        ok: false,
        error:
          "Có quá nhiều tài khoản được đăng ký từ mạng này trong 24 giờ qua. Hãy thử lại sau hoặc liên hệ Admin.",
      };
    }
  }

  const created = await createAuthUser(username, password);
  if (!created.ok) return created;

  const { error: insErr } = await sb.from("auto_members").insert({
    user_id: created.id,
    username,
    status: "trial",
    expires_at: new Date(Date.now() + AUTO_TRIAL_DAYS * 86400 * 1000).toISOString(),
    max_accs: 2,
  });
  if (insErr) {
    await sb.auth.admin.deleteUser(created.id); // hoàn tác để không để lại tài khoản mồ côi
    if (/duplicate|unique/i.test(insErr.message ?? ""))
      return { ok: false, error: "Tên đăng nhập này đã tồn tại." };
    return { ok: false, error: insErr.message || "Không tạo được tài khoản." };
  }
  await sb.from("auto_trials").upsert({ fp: fp.toLowerCase(), username, ip: ip || null });
  return { ok: true, message: `Đăng ký thành công! Bạn được dùng thử ${AUTO_TRIAL_DAYS} ngày.` };
}

export async function autoLoginCore(
  usernameRaw: string,
  password: string,
): Promise<AutoLoginResult> {
  const username = normUser(usernameRaw);
  const bad: Fail = { ok: false, error: "Sai tài khoản hoặc mật khẩu." };
  if (!AUTO_USERNAME_RE.test(username) || !password) return bad;

  const sb = await db();
  let m = await findMember(username);
  if (!m) return bad;

  // Thành viên cũ nhập từ app (chưa có tài khoản Supabase Auth): kiểm tra mã băm cũ, đúng thì chuyển sang Supabase Auth
  // ngay bây giờ (đang có mật khẩu nguyên văn trong tay) rồi xoá mã băm cũ.
  if (!m.user_id) {
    if (!(await verifyLegacy(m, password))) return bad;
    const made = await createAuthUser(username, password);
    if (!made.ok)
      return {
        ok: false,
        error: "Không chuyển được tài khoản sang máy chủ mới, vui lòng liên hệ Admin.",
      };
    const { error } = await sb
      .from("auto_members")
      .update({ user_id: made.id, legacy_salt: null, legacy_iter: null, legacy_hash: null })
      .eq("id", m.id);
    if (error) {
      await sb.auth.admin.deleteUser(made.id);
      return {
        ok: false,
        error: "Không chuyển được tài khoản sang máy chủ mới, vui lòng liên hệ Admin.",
      };
    }
    m = { ...m, user_id: made.id };
  }

  const { res, json } = await passwordGrant(usernameToEmail(username), password);
  if (!res.ok || !json.access_token) {
    const msg = friendlyAuthError(json, res.status);
    return { ok: false, error: /nhanh|quá/i.test(msg) ? msg : bad.error };
  }

  const settings = await getSettingsCore();
  const ev = evaluate(m, settings.contact);
  if (ev.role !== "member") {
    // Bị chặn (hết hạn / vô hiệu hóa / chờ kích hoạt): trả lý do, KHÔNG phát token.
    return {
      ok: true,
      role: ev.role,
      message: ev.message,
      server_time: nowS(),
      contact: settings.contact,
      pricing: settings.pricing,
      update_url: settings.update_url,
      pay_qr: settings.pay_qr,
    };
  }
  await sb.from("auto_members").update({ last_login_at: new Date().toISOString() }).eq("id", m.id);
  return {
    ok: true,
    role: "member",
    message: "",
    access_token: json.access_token as string,
    refresh_token: json.refresh_token as string,
    profile: profileOf(m),
    server_time: nowS(),
    contact: settings.contact,
    pricing: settings.pricing,
    update_url: settings.update_url,
    pay_qr: settings.pay_qr,
  };
}

/** Làm mới access_token bằng refresh_token — dùng cho cả thành viên lẫn admin (token Supabase Auth chung). */
export async function autoRefreshCore(refreshToken: string): Promise<AutoTokenResult> {
  if (!refreshToken) return { ok: false, error: "Thiếu refresh token.", code: "auth" };
  const { url, key } = supabaseServerConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token)
    return { ok: false, error: friendlyAuthError(json, res.status), code: "auth" };
  return {
    ok: true,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    email: json.user?.email ?? "",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Thành viên đã đăng nhập (Bearer access_token): hồ sơ / phiên 1 thiết bị
// ---------------------------------------------------------------------------------------------------------------
async function requireMember(accessToken: string): Promise<Ok<{ member: MemberDb }> | Fail> {
  if (!accessToken) return { ok: false, error: "Thiếu access token.", code: "auth" };
  const sb = await db();
  const { data: ud, error } = await sb.auth.getUser(accessToken);
  if (error || !ud?.user)
    return { ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", code: "auth" };
  const { data: m } = await sb
    .from("auto_members")
    .select("*")
    .eq("user_id", ud.user.id)
    .maybeSingle();
  if (!m)
    return { ok: false, error: "Tài khoản không còn trong danh sách thành viên.", code: "auth" };
  return { ok: true, member: m as MemberDb };
}

export async function autoMeCore(
  accessToken: string,
): Promise<
  | Ok<{
      role: AutoRole;
      message: string;
      profile: AutoProfile;
      server_time: number;
      contact: string;
      pricing: string;
      update_url: string;
    }>
  | Fail
> {
  const who = await requireMember(accessToken);
  if (!who.ok) return who;
  const settings = await getSettingsCore();
  const ev = evaluate(who.member, settings.contact);
  return {
    ok: true,
    role: ev.role,
    message: ev.message,
    profile: profileOf(who.member),
    server_time: nowS(),
    contact: settings.contact,
    pricing: settings.pricing,
    update_url: settings.update_url,
  };
}

interface DeviceInfo {
  device: string;
  host: string;
  ver: string;
  /** "pc" | "android". Thiếu / lạ => "pc". */
  platform?: string;
}

function cleanDevice(d: DeviceInfo): DeviceInfo | null {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(d.device)) return null;
  return {
    device: d.device,
    host: (d.host || "").slice(0, 40),
    ver: (d.ver || "").slice(0, 20),
    platform: d.platform === "android" ? "android" : "pc",
  };
}

export async function autoSessionAcquireCore(
  accessToken: string,
  d: DeviceInfo,
): Promise<Ok<{ server_time: number }> | Fail> {
  const who = await requireMember(accessToken);
  if (!who.ok) return who;
  const dev = cleanDevice(d);
  if (!dev) return { ok: false, error: "Thiếu mã thiết bị." };
  const settings = await getSettingsCore();
  const ev = evaluate(who.member, settings.contact);
  if (ev.role !== "member") return { ok: false, error: ev.message };

  const sb = await db();
  const { data, error } = await sb.rpc("auto_acquire_session", {
    p_member: who.member.id,
    p_device: dev.device,
    p_host: dev.host,
    p_ver: dev.ver,
    p_ttl: AUTO_SESSION_TTL_S,
    p_platform: dev.platform,
  });
  if (error) return { ok: false, error: error.message || "Không ghi được phiên đăng nhập." };
  if (data === "busy") {
    return {
      ok: false,
      code: "busy",
      error:
        "Tài khoản đang được sử dụng\n(Tài khoản đang đăng nhập ở một máy khác. Hãy thoát app ở máy đó; nếu máy đó đã tắt đột ngột thì thử lại sau vài phút.)",
    };
  }
  return { ok: true, server_time: nowS() };
}

export async function autoSessionCheckCore(
  accessToken: string,
  d: DeviceInfo,
): Promise<Ok<{ state: "ok" | "kicked"; server_time: number }> | Fail> {
  const who = await requireMember(accessToken);
  if (!who.ok) return who;
  const dev = cleanDevice(d);
  if (!dev) return { ok: false, error: "Thiếu mã thiết bị." };
  const sb = await db();
  const { data, error } = await sb.rpc("auto_check_session", {
    p_member: who.member.id,
    p_device: dev.device,
    p_host: dev.host,
    p_ver: dev.ver,
    p_hb_every: AUTO_HB_EVERY_S,
    p_platform: dev.platform,
  });
  if (error) return { ok: false, error: error.message || "Không kiểm tra được phiên đăng nhập." };
  return { ok: true, state: data === "kicked" ? "kicked" : "ok", server_time: nowS() };
}

export async function autoSessionReleaseCore(
  accessToken: string,
  d: DeviceInfo,
): Promise<{ ok: true } | Fail> {
  const who = await requireMember(accessToken);
  if (!who.ok) return who;
  const dev = cleanDevice(d);
  if (!dev) return { ok: false, error: "Thiếu mã thiết bị." };
  const sb = await db();
  await sb
    .from("auto_sessions")
    .update({ released: true, hb: new Date(0).toISOString() })
    .eq("member_id", who.member.id)
    .eq("platform", dev.platform ?? "pc")
    .eq("device", dev.device);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Admin — tự xác minh caller thực sự có quyền admin (user_roles) TRƯỚC khi làm gì
// ---------------------------------------------------------------------------------------------------------------
async function requireCallerIsAdmin(accessToken: string): Promise<{ ok: true } | Fail> {
  if (!accessToken) return { ok: false, error: "Thiếu access token.", code: "auth" };
  const sb = await db();
  const { data: ud, error } = await sb.auth.getUser(accessToken);
  if (error || !ud?.user)
    return { ok: false, error: "Phiên đăng nhập không hợp lệ.", code: "auth" };
  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", ud.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return { ok: false, error: "Bạn không có quyền admin.", code: "auth" };
  return { ok: true };
}

/** Đăng nhập tài khoản admin của web (email + mật khẩu) để app Auto thao tác quản lý thành viên. */
export async function autoAdminLoginCore(
  email: string,
  password: string,
): Promise<AutoTokenResult> {
  const e = (email || "").trim().toLowerCase();
  if (!e || !password) return { ok: false, error: "Nhập email và mật khẩu admin của web." };
  const { res, json } = await passwordGrant(e, password);
  if (!res.ok || !json.access_token) {
    const msg = friendlyAuthError(json, res.status);
    return {
      ok: false,
      error: msg === "Sai tài khoản hoặc mật khẩu." ? "Sai email hoặc mật khẩu admin." : msg,
    };
  }
  const check = await requireCallerIsAdmin(json.access_token);
  if (!check.ok) return check;
  return {
    ok: true,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    email: json.user?.email ?? e,
  };
}

type SessDb = {
  member_id: string;
  platform: string;
  device: string;
  host: string | null;
  ver: string | null;
  hb: string;
  released: boolean;
};

function toSessionInfo(s: SessDb): AutoSessionInfo {
  return {
    platform: s.platform === "android" ? "android" : "pc",
    device: s.device,
    host: s.host,
    ver: s.ver,
    hb: s.hb,
    live: !s.released && Date.now() - Date.parse(s.hb) < AUTO_SESSION_TTL_S * 1000,
  };
}

function toRow(m: MemberDb, ss: SessDb[]): AutoMemberRow {
  const sessions = ss
    .map(toSessionInfo)
    .sort((x, y) => (x.platform === y.platform ? 0 : x.platform === "pc" ? -1 : 1));
  const latest = [...sessions].sort((x, y) => Date.parse(y.hb) - Date.parse(x.hb))[0] ?? null;
  return {
    id: m.id,
    username: m.username,
    status: m.status,
    expiresAt: m.expires_at,
    maxAccs: m.max_accs,
    deny: cleanDeny(m.deny),
    createdAt: m.created_at,
    lastLoginAt: m.last_login_at,
    migrated: !!m.user_id,
    sessions,
    session: latest,
  };
}

export async function autoAdminListCore(
  accessToken: string,
): Promise<Ok<{ members: AutoMemberRow[]; settings: AutoSettings; server_time: number }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const sb = await db();
  const [{ data: ms, error }, { data: ss }] = await Promise.all([
    sb.from("auto_members").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("auto_sessions").select("*"),
  ]);
  if (error) return { ok: false, error: error.message };
  const byMember = new Map<string, SessDb[]>();
  for (const s of (ss ?? []) as SessDb[]) {
    const arr = byMember.get(s.member_id) ?? [];
    arr.push(s);
    byMember.set(s.member_id, arr);
  }
  const members = ((ms ?? []) as MemberDb[]).map((m) => toRow(m, byMember.get(m.id) ?? []));
  return { ok: true, members, settings: await getSettingsCore(), server_time: nowS() };
}

export interface AutoCreateInput {
  username: string;
  password: string;
  /** Số ngày dùng từ bây giờ; 0 = vĩnh viễn. */
  days: number;
  /** 0 = không giới hạn. */
  max_accs: number;
  status?: AutoStatus | undefined;
  /** Quyền / mã gói ban đầu (tuỳ chọn). Đi qua cleanDeny. */
  deny?: string[] | undefined;
}

export async function autoAdminCreateCore(
  accessToken: string,
  input: AutoCreateInput,
): Promise<Ok<{ message: string }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const username = normUser(input.username);
  if (!AUTO_USERNAME_RE.test(username))
    return { ok: false, error: "Tên đăng nhập 3-32 ký tự: chữ, số, dấu . _ -" };
  if (username === "admin") return { ok: false, error: "Không được dùng tên 'admin'." };
  if ((input.password ?? "").length < AUTO_MIN_PW)
    return { ok: false, error: `Mật khẩu tối thiểu ${AUTO_MIN_PW} ký tự.` };
  const status = STATUSES.includes(input.status ?? "") ? (input.status as AutoStatus) : "active";
  const days = Math.max(0, Math.floor(Number(input.days) || 0));
  const maxAccs = Math.max(0, Math.floor(Number(input.max_accs) || 0));
  if (await findMember(username)) return { ok: false, error: "Tên đăng nhập này đã tồn tại." };

  const sb = await db();
  const created = await createAuthUser(username, input.password);
  if (!created.ok) return created;
  const { error } = await sb.from("auto_members").insert({
    user_id: created.id,
    username,
    status,
    expires_at: days ? new Date(Date.now() + days * 86400 * 1000).toISOString() : null,
    max_accs: maxAccs,
    deny: cleanDeny(input.deny),
  });
  if (error) {
    await sb.auth.admin.deleteUser(created.id);
    return { ok: false, error: error.message };
  }
  const lim = maxAccs ? `tối đa ${maxAccs} acc` : "không giới hạn acc";
  return {
    ok: true,
    message: `Đã thêm thành viên ${days ? `(dùng được ${days} ngày` : "(không giới hạn thời gian"}, ${lim}).`,
  };
}

export interface AutoUpdateInput {
  username: string;
  status?: AutoStatus | undefined;
  max_accs?: number | undefined;
  deny?: string[] | undefined;
  /** days = 0 → vĩnh viễn; extend = true → cộng thêm vào hạn còn lại (nếu chưa hết). */
  expiry?: { days: number; extend: boolean } | undefined;
}

export async function autoAdminUpdateCore(
  accessToken: string,
  input: AutoUpdateInput,
): Promise<Ok<{ message: string }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const m = await findMember(normUser(input.username));
  if (!m) return { ok: false, error: "Không tìm thấy thành viên." };

  const patch: Record<string, unknown> = {};
  let msg = "Đã lưu.";
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) return { ok: false, error: "Trạng thái không hợp lệ." };
    patch["status"] = input.status;
  }
  if (input.max_accs !== undefined)
    patch["max_accs"] = Math.max(0, Math.floor(Number(input.max_accs) || 0));
  if (input.deny !== undefined)
    patch["deny"] = cleanDeny(input.deny);
  if (input.expiry !== undefined) {
    const days = Math.max(0, Math.floor(Number(input.expiry.days) || 0));
    if (!days) {
      patch["expires_at"] = null;
      msg = "Đã đặt: không giới hạn thời gian.";
    } else {
      let base = Date.now();
      const cur = m.expires_at ? Date.parse(m.expires_at) : NaN;
      if (input.expiry.extend && Number.isFinite(cur) && cur > base) base = cur;
      const next = new Date(base + days * 86400 * 1000);
      patch["expires_at"] = next.toISOString();
      msg = `Hạn dùng mới: ${next.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`;
    }
  }
  if (Object.keys(patch).length === 0) return { ok: true, message: msg };
  const sb = await db();
  const { error } = await sb.from("auto_members").update(patch).eq("id", m.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: msg };
}

export async function autoAdminSetPasswordCore(
  accessToken: string,
  usernameRaw: string,
  password: string,
): Promise<Ok<{ message: string }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  if ((password ?? "").length < AUTO_MIN_PW)
    return { ok: false, error: `Mật khẩu tối thiểu ${AUTO_MIN_PW} ký tự.` };
  const m = await findMember(normUser(usernameRaw));
  if (!m) return { ok: false, error: "Không tìm thấy thành viên." };
  const sb = await db();
  if (m.user_id) {
    const { error } = await sb.auth.admin.updateUserById(m.user_id, { password });
    if (error) return { ok: false, error: error.message };
  } else {
    // Thành viên cũ chưa chuyển sang Supabase Auth: tạo luôn với mật khẩu mới, bỏ mã băm cũ.
    const made = await createAuthUser(m.username, password);
    if (!made.ok) return made;
    const { error } = await sb
      .from("auto_members")
      .update({ user_id: made.id, legacy_salt: null, legacy_iter: null, legacy_hash: null })
      .eq("id", m.id);
    if (error) {
      await sb.auth.admin.deleteUser(made.id);
      return { ok: false, error: error.message };
    }
  }
  return { ok: true, message: "Đã đổi mật khẩu." };
}

export async function autoAdminDeleteCore(
  accessToken: string,
  usernameRaw: string,
): Promise<{ ok: true } | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const m = await findMember(normUser(usernameRaw));
  if (!m) return { ok: true };
  const sb = await db();
  if (m.user_id) {
    const { error } = await sb.auth.admin.deleteUser(m.user_id);
    if (error && !/not.?found/i.test(error.message ?? ""))
      return { ok: false, error: error.message };
  }
  const { error } = await sb.from("auto_members").delete().eq("id", m.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Xoá phiên đăng nhập hiện tại của 1 thành viên (máy treo / mất máy) để họ đăng nhập lại ngay được. */
export async function autoAdminKickCore(
  accessToken: string,
  usernameRaw: string,
): Promise<{ ok: true } | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const m = await findMember(normUser(usernameRaw));
  if (!m) return { ok: false, error: "Không tìm thấy thành viên." };
  const sb = await db();
  const { error } = await sb.from("auto_sessions").delete().eq("member_id", m.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function autoAdminSetSettingsCore(
  accessToken: string,
  patch: {
    registration_open?: boolean | undefined;
    contact?: string | undefined;
    pricing?: string | undefined;
    update_url?: string | undefined;
    pay_qr?: string | undefined;
  },
): Promise<Ok<{ settings: AutoSettings }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  const sb = await db();
  const rows: { key: string; value: unknown; updated_at: string }[] = [];
  const at = new Date().toISOString();
  if (typeof patch.registration_open === "boolean")
    rows.push({ key: "registration_open", value: patch.registration_open, updated_at: at });
  if (typeof patch.contact === "string")
    rows.push({ key: "contact", value: patch.contact.trim().slice(0, 200), updated_at: at });
  // Bảng giá (chuỗi JSON do app soạn): lưu NGUYÊN VĂN - không trim / parse / cắt. Chuỗi rỗng = xoá (app quay về ảnh mặc định).
  if (typeof patch.pricing === "string") {
    if (patch.pricing.length > AUTO_PRICING_MAX)
      return { ok: false, error: `Bảng giá quá dài (${patch.pricing.length} / tối đa ${AUTO_PRICING_MAX} ký tự).` };
    rows.push({ key: "pricing", value: patch.pricing, updated_at: at });
  }
  if (typeof patch.update_url === "string") {
    const u = patch.update_url.trim();
    if (u.length > AUTO_UPDATE_URL_MAX)
      return { ok: false, error: `Đường dẫn cập nhật quá dài (tối đa ${AUTO_UPDATE_URL_MAX} ký tự).` };
    rows.push({ key: "update_url", value: u, updated_at: at });
  }
  if (typeof patch.pay_qr === "string") {
    if (patch.pay_qr.length > AUTO_PAY_QR_MAX)
      return { ok: false, error: "Ảnh QR quá lớn (tối đa khoảng 1 MB sau khi mã hoá base64)." };
    rows.push({ key: "pay_qr", value: patch.pay_qr, updated_at: at });
  }
  if (rows.length) {
    const { error } = await sb.from("auto_settings").upsert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, settings: await getSettingsCore() };
}

/** Một lần: nhập danh sách thành viên cũ (users.json của app, mật khẩu đã băm PBKDF2) lên web. */
export interface LegacyRecord {
  user: string;
  salt: string;
  iter?: number;
  hash: string;
  status?: string;
  expires?: number;
  max_accs?: number;
  deny?: string[];
}

export async function autoAdminImportCore(
  accessToken: string,
  records: LegacyRecord[],
): Promise<Ok<{ imported: number; skipped: number }> | Fail> {
  const check = await requireCallerIsAdmin(accessToken);
  if (!check.ok) return check;
  if (!Array.isArray(records)) return { ok: false, error: "Dữ liệu nhập không hợp lệ." };
  const sb = await db();
  let imported = 0;
  let skipped = 0;
  for (const r of records.slice(0, 5000)) {
    const username = normUser(r?.user);
    const iter = Number(r?.iter ?? 200000);
    if (
      !AUTO_USERNAME_RE.test(username) ||
      username === "admin" ||
      !/^[a-f0-9]{32}$/i.test(r?.salt ?? "") ||
      !/^[a-f0-9]{64}$/i.test(r?.hash ?? "") ||
      !Number.isInteger(iter) ||
      iter < 100000 ||
      iter > MAX_LEGACY_ITERS
    ) {
      skipped++;
      continue;
    }
    const exp = Number(r.expires);
    const { error } = await sb.from("auto_members").insert({
      username,
      status: STATUSES.includes(r.status ?? "") ? r.status : "active",
      expires_at: Number.isFinite(exp) && exp > 0 ? isoOrNull(Math.floor(exp)) : null,
      max_accs: r.max_accs === undefined ? 2 : Math.max(0, Math.floor(Number(r.max_accs) || 0)),
      deny: cleanDeny(r.deny),
      legacy_salt: r.salt.toLowerCase(),
      legacy_iter: iter,
      legacy_hash: r.hash.toLowerCase(),
    });
    if (error)
      skipped++; // trùng tên (đã có trên web) hoặc lỗi khác
    else imported++;
  }
  return { ok: true, imported, skipped };
}


// ---------------------------------------------------------------------------------------------------------------
// NGÂN HÀNG ĐÁP ÁN HỎI ĐÁP DÙNG CHUNG: app của mọi người dùng đẩy câu đã học lên và tải về toàn bộ.
// Lưu trong auto_settings (key "quiz_bank", value = object { "câu hỏi (đã chuẩn hoá)": "đáp án đúng (đã chuẩn hoá)" }).
// Không cần bảng mới. Chỉ thành viên đang đăng nhập hoặc admin mới gọi được.
// ---------------------------------------------------------------------------------------------------------------
const QUIZ_MAX_ENTRIES = 20000;

async function requireMemberOrAdmin(accessToken: string): Promise<{ ok: true } | Fail> {
  const m = await requireMember(accessToken);
  if (m.ok) return { ok: true };
  return requireCallerIsAdmin(accessToken);
}

async function readQuizBank(): Promise<Record<string, string>> {
  const sb = await db();
  const { data } = await sb.from("auto_settings").select("value").eq("key", "quiz_bank").maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const [k, a] of Object.entries(v as Record<string, unknown>)) if (typeof a === "string") out[k] = a;
    return out;
  }
  return {};
}

export async function autoQuizGetCore(
  accessToken: string,
): Promise<Ok<{ bank: Record<string, string>; count: number }> | Fail> {
  const who = await requireMemberOrAdmin(accessToken);
  if (!who.ok) return who;
  const bank = await readQuizBank();
  return { ok: true, bank, count: Object.keys(bank).length };
}

export async function autoQuizSubmitCore(
  accessToken: string,
  entries: unknown,
): Promise<Ok<{ added: number; count: number }> | Fail> {
  const who = await requireMemberOrAdmin(accessToken);
  if (!who.ok) return who;
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    return { ok: false, error: "Dữ liệu không hợp lệ." };
  const bank = await readQuizBank();
  let added = 0;
  let n = 0;
  for (const [q, a] of Object.entries(entries as Record<string, unknown>)) {
    if (++n > 300) break; // mỗi lần gửi tối đa 300 câu
    if (typeof a !== "string") continue;
    const kq = q.trim().slice(0, 300);
    const ka = a.trim().slice(0, 200);
    if (kq.length < 4 || !ka) continue;
    if (bank[kq] === ka) continue;
    if (!(kq in bank) && Object.keys(bank).length >= QUIZ_MAX_ENTRIES) continue;
    bank[kq] = ka; // đáp án do game xác nhận sau khi trả lời -> bản mới nhất là bản đúng
    added++;
  }
  if (added) {
    const sb = await db();
    const { error } = await sb
      .from("auto_settings")
      .upsert([{ key: "quiz_bank", value: bank, updated_at: new Date().toISOString() }]);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, added, count: Object.keys(bank).length };
}