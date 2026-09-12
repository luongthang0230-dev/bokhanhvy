import { useEffect } from "react";

const TAG_IDS = {
  manifest: "tinhluong-pwa-manifest",
  themeColor: "tinhluong-pwa-theme-color",
  appleCapable: "tinhluong-pwa-apple-capable",
  appleStatusBar: "tinhluong-pwa-apple-status-bar",
  appleTitle: "tinhluong-pwa-apple-title",
  appleIcon: "tinhluong-pwa-apple-icon",
  favicon: "tinhluong-pwa-favicon",
};

/**
 * Gắn manifest + các thẻ meta PWA CHỈ khi đang ở trang /tinhluong* — dọn dẹp
 * lại khi rời trang, để phần còn lại của website không bị ảnh hưởng (đúng
 * yêu cầu "không phá vỡ website hiện tại"). Đồng thời đăng ký service worker
 * với scope riêng "/tinhluong" để có thể cài đặt (Windows/Android) và mở
 * lại khi mất mạng.
 */
export function usePwa() {
  useEffect(() => {
    const created: HTMLElement[] = [];

    function addTag(id: string, build: () => HTMLElement) {
      if (document.getElementById(id)) return;
      const el = build();
      el.id = id;
      document.head.appendChild(el);
      created.push(el);
    }

    addTag(TAG_IDS.manifest, () => {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/tinhluong-manifest.webmanifest";
      return link;
    });
    addTag(TAG_IDS.themeColor, () => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#2563eb";
      return meta;
    });
    // iOS "Add to Home Screen"
    addTag(TAG_IDS.appleCapable, () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-capable");
      meta.content = "yes";
      return meta;
    });
    addTag(TAG_IDS.appleStatusBar, () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      meta.content = "default";
      return meta;
    });
    addTag(TAG_IDS.appleTitle, () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-title");
      meta.content = "Tính Lương";
      return meta;
    });
    addTag(TAG_IDS.appleIcon, () => {
      const link = document.createElement("link");
      link.rel = "apple-touch-icon";
      link.href = "/icons/apple-touch-icon.png";
      return link;
    });
    addTag(TAG_IDS.favicon, () => {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = "/icons/favicon-tinhluong.png";
      link.type = "image/png";
      return link;
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/tinhluong-sw.js", { scope: "/tinhluong" })
        .catch(() => {
          // Không nghiêm trọng — trang vẫn dùng bình thường khi có mạng,
          // chỉ là không cài được / không mở offline được.
        });
    }

    return () => {
      for (const el of created) el.remove();
    };
  }, []);
}
