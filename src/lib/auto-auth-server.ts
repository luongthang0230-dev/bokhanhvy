// Bọc các hàm admin của auto-auth-core.ts bằng createServerFn để tab "Người dùng Auto" (chạy trong trình duyệt,
// trong React) gọi qua cơ chế RPC nội bộ của TanStack Start - giống cpk-auth-server.ts.
import { createServerFn } from "@tanstack/react-start";
import {
  autoAdminListCore,
  autoAdminCreateCore,
  autoAdminUpdateCore,
  autoAdminSetPasswordCore,
  autoAdminDeleteCore,
  autoAdminKickCore,
  autoAdminSetSettingsCore,
  AUTO_FEATURES,
  AUTO_EXTRAS,
  type AutoCreateInput,
  type AutoUpdateInput,
  type AutoMemberRow,
  type AutoSettings,
  type AutoStatus,
} from "@/lib/auto-auth-core";

export { AUTO_FEATURES, AUTO_EXTRAS };
export type { AutoMemberRow, AutoSettings, AutoStatus, AutoCreateInput, AutoUpdateInput };

export const autoAdminList = createServerFn({ method: "POST" })
  .validator((d: { access_token: string }) => d)
  .handler(async ({ data }) => autoAdminListCore(data.access_token));

export const autoAdminCreate = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; input: AutoCreateInput }) => d)
  .handler(async ({ data }) => autoAdminCreateCore(data.access_token, data.input));

export const autoAdminUpdate = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; input: AutoUpdateInput }) => d)
  .handler(async ({ data }) => autoAdminUpdateCore(data.access_token, data.input));

export const autoAdminSetPassword = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; username: string; password: string }) => d)
  .handler(async ({ data }) =>
    autoAdminSetPasswordCore(data.access_token, data.username, data.password),
  );

export const autoAdminDelete = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; username: string }) => d)
  .handler(async ({ data }) => autoAdminDeleteCore(data.access_token, data.username));

export const autoAdminKick = createServerFn({ method: "POST" })
  .validator((d: { access_token: string; username: string }) => d)
  .handler(async ({ data }) => autoAdminKickCore(data.access_token, data.username));

export const autoAdminSetSettings = createServerFn({ method: "POST" })
  .validator(
    (d: {
      access_token: string;
      registration_open?: boolean | undefined;
      contact?: string | undefined;
    }) => d,
  )
  .handler(async ({ data }) =>
    autoAdminSetSettingsCore(data.access_token, {
      registration_open: data.registration_open,
      contact: data.contact,
    }),
  );
