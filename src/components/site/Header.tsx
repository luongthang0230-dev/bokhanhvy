import { Link } from "@tanstack/react-router";
import { useSettings } from "@/lib/settings";

/** "Lương Thắng" -> "LT", "DevKho" -> "DE". Falls back to a 2-char slice for single-word names. */
function siteInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const { settings } = useSettings();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-4xl items-center px-4">
        <Link to="/" className="flex items-center gap-2.5">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.siteName} className="h-8 w-auto" />
          ) : (
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-primary-foreground">
              {siteInitials(settings.siteName)}
            </span>
          )}
          <span className="font-display text-lg font-bold tracking-tight">
            {settings.siteName}
          </span>
        </Link>
      </div>
    </header>
  );
}
