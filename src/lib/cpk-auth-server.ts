// Bọc cpkAdminListUsersCore bằng createServerFn để trang Admin (chạy trong trình
// duyệt, trong React) gọi được qua cơ chế RPC nội bộ của TanStack Start - giống
// hệt cách payrollAdminListUsers được dùng trong AdminPayrollUsers.tsx.
//
// Các thao tác Đặt lại mật khẩu / Khoá / Xoá tài khoản KHÔNG cần định nghĩa lại
// ở đây: payrollAdminResetPassword / payrollAdminSetLocked / payrollAdminDeleteUser
// (trong payroll-auth-server.ts) đã là hàm CHUNG cho mọi tài khoản (chỉ thao tác
// theo target_user_id sau khi xác minh caller là admin, không quan tâm tài khoản
// đó thuộc app nào) nên AdminCpkUsers.tsx tái sử dụng thẳng 3 hàm đó.
import { createServerFn } from "@tanstack/react-start";
import {
  cpkAdminListUsersCore,
  cpkIsRegistrationEnabledCore,
  cpkAdminSetRegistrationEnabledCore,
  type CpkUserRow,
} from "@/lib/cpk-auth-core";

export type { CpkUserRow };

export const cpkAdminListUsers = createServerFn({ method: "POST" })
  .validator((d: { access_token: string }) => d)
  .handler(async ({ data }) => cpkAdminListUsersCore(data.access_token));

export const cpkIsRegistrationEnabled = createServerFn({ method: "GET" }).handler(async () =>
  cpkIsRegistrationEnabledCore(),
);

export const cpkAdminSetRegistrationEnabled = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; enabled: boolean }) => d)
  .handler(async ({ data }) => cpkAdminSetRegistrationEnabledCore(data.access_token, data.enabled));
