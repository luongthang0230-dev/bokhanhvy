import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Trả về { user, username, isLoading } cho phiên đăng nhập hiện tại (dùng
 *  chung Supabase Auth với Admin, nhưng đây là tài khoản "Tính lương" —
 *  phân biệt bằng user_metadata.payroll_username). */
export function usePayrollAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ["payroll-auth"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return { user: null, username: null };
      return {
        user: session.user,
        username: (session.user.user_metadata?.["payroll_username"] as string | undefined) ?? null,
      };
    },
    staleTime: 30_000,
  });
  return { user: data?.user ?? null, username: data?.username ?? null, isLoading };
}

export function usePayrollAuthRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["payroll-auth"] });
}
