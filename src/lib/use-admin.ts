import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { serverCheckAdmin } from "@/lib/admin-auth-server";

/** Returns { user, isAdmin, isLoading } for the current session. */
export function useAdminAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-auth"],
    queryFn: async () => {
      // getSession() chỉ đọc từ bộ nhớ/localStorage cục bộ, KHÔNG gọi mạng —
      // khác với getUser() vốn gọi thẳng sang Supabase từ trình duyệt (điểm
      // hay bị mạng chặn/làm chậm). Việc xác minh phiên + quyền admin thật
      // sự diễn ra ở server function serverCheckAdmin (Vercel → Supabase).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return { user: null, isAdmin: false };
      const result = await serverCheckAdmin({ data: { access_token: session.access_token } });
      return result;
    },
    staleTime: 30_000,
  });
  return { user: data?.user ?? null, isAdmin: data?.isAdmin ?? false, isLoading };
}
