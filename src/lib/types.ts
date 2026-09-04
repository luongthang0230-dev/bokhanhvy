export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

export type DownloadLink = {
  id: string;
  software_id: string;
  label: string;
  provider: string;
  url: string;
  note: string | null;
  sort_order: number;
};

export type Software = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  youtube_url?: string | null;
  description: string | null;
  install_guide: string | null;
  changelog: string | null;
  icon_url: string | null;
  screenshots: string[];
  version: string | null;
  size_label: string | null;
  os: string | null;
  developer: string | null;
  license: string | null;
  kind: string;
  category_id: string | null;
  is_featured: boolean;
  is_new: boolean;
  is_pinned: boolean;
  published: boolean;
  sort_order: number;
  downloads: number;
  likes: number;
  seo_title: string | null;
  seo_description: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, "id" | "name" | "slug"> | null;
  download_links?: DownloadLink[];
};

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  cover_url: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
};

export type Banner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  is_active: boolean;
  sort_order: number;
};

export type HomeSection = {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  enabled: boolean;
  sort_order: number;
};

export type FeedbackConversation = {
  id: string;
  visitor_name: string;
  created_at: string;
  last_message_at: string;
  is_read: boolean;
};

export type FeedbackMessage = {
  id: string;
  conversation_id: string;
  sender_type: "visitor" | "admin";
  content: string;
  created_at: string;
};

export type MenuItem = { label: string; href: string };

export type SiteSettings = {
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  theme: "light" | "dark";
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  heroCtaLink: string;
  heroImage: string;
  headerMenu: MenuItem[];
  footerText: string;
  footerLinks: MenuItem[];
  aboutTitle: string;
  aboutContent: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImage: string;
};

export const defaultSettings: SiteSettings = {
  siteName: "Lương Thắng",
  tagline: "Kho phần mềm & công cụ cá nhân",
  logoUrl: "",
  faviconUrl: "/favicon.ico",
  primaryColor: "#2563eb",
  accentColor: "#0ea5e9",
  backgroundColor: "#f8fafc",
  fontFamily: '"Space Grotesk"',
  theme: "light",
  heroTitle: "Tải phần mềm sạch, nhanh và an toàn",
  heroSubtitle: "Bộ sưu tập phần mềm, công cụ và tài nguyên được tuyển chọn thủ công.",
  heroCtaLabel: "Khám phá phần mềm",
  heroCtaLink: "/phan-mem",
  heroImage: "",
  headerMenu: [
    { label: "Trang chủ", href: "/" },
    { label: "Phần mềm", href: "/phan-mem" },
    { label: "Công cụ", href: "/cong-cu" },
    { label: "Tài nguyên", href: "/tai-nguyen" },
    { label: "Giới thiệu", href: "/gioi-thieu" },
  ],
  footerText: "© 2026 Lương Thắng - Cho đi là mất sạch.",
  footerLinks: [],
  aboutTitle: "Về Lương Thắng",
  aboutContent: "",
  seoTitle: "Lương Thắng — Kho phần mềm & công cụ tuyển chọn",
  seoDescription: "Tải phần mềm, công cụ và tài nguyên miễn phí, an toàn.",
  seoKeywords: "tải phần mềm, công cụ miễn phí",
  ogImage: "",
};
