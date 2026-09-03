import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { settingsQuery } from "./api";
import { defaultSettings, type SiteSettings } from "./types";

export function useSettings(): { settings: SiteSettings; isLoading: boolean } {
  const { data, isLoading } = useQuery({ ...settingsQuery, staleTime: 30_000 });
  return { settings: data ?? defaultSettings, isLoading };
}

/** Applies admin-configured colors, fonts and theme to the document at runtime. */
export function ThemeApplier() {
  const { settings } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", settings.primaryColor);
    root.style.setProperty("--ring", settings.primaryColor);
    root.style.setProperty("--accent-brand", settings.accentColor);
    root.style.setProperty("--background", settings.backgroundColor);
    root.style.setProperty(
      "--font-sans",
      `${settings.fontFamily}, ui-sans-serif, system-ui, sans-serif`,
    );
    root.classList.toggle("dark", settings.theme === "dark");
  }, [settings]);

  useEffect(() => {
    if (!settings.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = settings.faviconUrl;
  }, [settings.faviconUrl]);

  return null;
}
