import { supabase } from "@/integrations/supabase/client";
import type {
  Banner,
  Category,
  HomeSection,
  Post,
  SiteSettings,
  Software,
} from "./types";
import { defaultSettings } from "./types";

const SOFTWARE_SELECT =
  "*, categories:category_id(id,name,slug), download_links(*)";

export const settingsQuery = {
  queryKey: ["site-settings"],
  queryFn: async (): Promise<SiteSettings> => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;
    return { ...defaultSettings, ...((data?.data as Partial<SiteSettings>) ?? {}) };
  },
};

export const sectionsQuery = {
  queryKey: ["home-sections"],
  queryFn: async (): Promise<HomeSection[]> => {
    const { data, error } = await supabase
      .from("home_sections")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as HomeSection[];
  },
};

export const categoriesQuery = {
  queryKey: ["categories"],
  queryFn: async (): Promise<Category[]> => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Category[];
  },
};

export const bannersQuery = {
  queryKey: ["banners"],
  queryFn: async (): Promise<Banner[]> => {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Banner[];
  },
};

export const postsQuery = {
  queryKey: ["posts"],
  queryFn: async (): Promise<Post[]> => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Post[];
  },
};

export type SoftwareFilter = {
  kind?: "software" | "tool";
  featured?: boolean;
  isNew?: boolean;
  popular?: boolean;
  categorySlug?: string;
  search?: string;
  limit?: number;
  includeUnpublished?: boolean;
};

export function softwareQuery(filter: SoftwareFilter = {}) {
  return {
    queryKey: ["software", filter],
    queryFn: async (): Promise<Software[]> => {
      let q = supabase.from("software").select(SOFTWARE_SELECT);
      if (!filter.includeUnpublished) q = q.eq("published", true);
      if (filter.kind) q = q.eq("kind", filter.kind);
      if (filter.featured) q = q.eq("is_featured", true);
      if (filter.isNew) q = q.eq("is_new", true);
      if (filter.search) {
        const s = filter.search.replace(/[%,]/g, " ");
        q = q.or(`name.ilike.%${s}%,tagline.ilike.%${s}%,description.ilike.%${s}%`);
      }
      q = filter.popular
        ? q.order("downloads", { ascending: false })
        : filter.isNew
          ? q.order("updated_at", { ascending: false })
          : q.order("sort_order");
      if (filter.limit) q = q.limit(filter.limit);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as unknown as Software[];
      if (filter.categorySlug)
        rows = rows.filter((r) => r.categories?.slug === filter.categorySlug);
      return rows;
    },
  };
}

export function softwareBySlugQuery(slug: string) {
  return {
    queryKey: ["software-detail", slug],
    queryFn: async (): Promise<Software | null> => {
      const { data, error } = await supabase
        .from("software")
        .select(SOFTWARE_SELECT)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Software) ?? null;
    },
  };
}

export async function registerDownload(softwareId: string) {
  await supabase.rpc("register_download", { _software_id: softwareId });
}

export function youtubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/) ??
    url.match(/^([\w-]{11})$/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
