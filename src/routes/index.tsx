import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, HardDrive, Monitor, PackageOpen, Tag } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { softwareQuery, registerDownload, formatNumber, youtubeEmbedUrl } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import type { Software } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lương Thắng — Cho đi là mất sạch" },
      { name: "description", content: "Tải phần mềm miễn phí qua Google Drive, nhanh và an toàn." },
      { property: "og:title", content: "Lương Thắng — Cho đi là mất sạch" },
      { property: "og:description", content: "Tải phần mềm miễn phí qua Google Drive, nhanh và an toàn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

function HomePage() {
  const { settings } = useSettings();
  const { data, isLoading, isError, refetch } = useQuery(softwareQuery());

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-secondary/60 to-background">
          <div className="mx-auto max-w-4xl px-4 py-14 text-center">
            <h1 className="fade-up text-3xl font-bold tracking-tight sm:text-4xl">
              {settings.heroTitle}
            </h1>
            <p className="fade-up mx-auto mt-3 max-w-xl text-muted-foreground">
              {settings.heroSubtitle}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-10">
          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <div className="card-surface p-10 text-center">
              <p className="text-muted-foreground">Không tải được dữ liệu. Vui lòng thử lại.</p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                Thử lại
              </Button>
            </div>
          )}

          {data && data.length === 0 && (
            <div className="card-surface flex flex-col items-center gap-3 p-12 text-center">
              <PackageOpen className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Chưa có phần mềm nào. Quay lại sau nhé!</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {data?.map((sw, i) => (
              <SoftwareCard key={sw.id} sw={sw} index={i} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function SoftwareCard({ sw, index }: { sw: Software; index: number }) {
  const driveLink =
    sw.download_links?.find((l) => l.provider === "google-drive") ??
    sw.download_links?.[0];
  const embed = youtubeEmbedUrl(sw.youtube_url);
  const [descOpen, setDescOpen] = useState(false);
  const hasDescription = !!sw.description?.trim();

  function handleDownload() {
    if (!driveLink) return;
    registerDownload(sw.id);
    window.open(driveLink.url, "_blank", "noopener,noreferrer");
  }

  return (
    <article
      className="card-surface hover-lift fade-up flex flex-col gap-4 p-5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {embed ? (
        <div className="space-y-3">
          {/* Video loads immediately (not lazy/click-gated) so visitors land on a
              ready-to-play player, like a professional product page. */}
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-secondary">
            <iframe
              src={embed}
              title={`Video hướng dẫn ${sw.name}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight">{sw.name}</h2>
            {sw.tagline && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{sw.tagline}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <img
            src={sw.icon_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${sw.slug}`}
            alt={`Icon ${sw.name}`}
            className="h-14 w-14 shrink-0 rounded-xl border border-border"
            loading="lazy"
          />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight">{sw.name}</h2>
            {sw.tagline && (
              <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{sw.tagline}</p>
            )}
          </div>
        </div>
      )}

      {hasDescription && (
        <button
          type="button"
          onClick={() => setDescOpen(true)}
          className="group -mt-1 text-left"
        >
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
            {sw.description}
          </p>
          <span className="mt-1 inline-block text-xs font-semibold text-primary group-hover:underline">
            Xem chi tiết →
          </span>
        </button>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {sw.version && (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3.5 w-3.5" /> v{sw.version}
          </span>
        )}
        {sw.size_label && (
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5" /> {sw.size_label}
          </span>
        )}
        {sw.os && (
          <span className="inline-flex items-center gap-1">
            <Monitor className="h-3.5 w-3.5" /> {sw.os}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Download className="h-3.5 w-3.5" /> {formatNumber(sw.downloads)} lượt tải
        </span>
      </div>

      <Button
        className="brand-gradient mt-auto w-full font-semibold text-primary-foreground"
        size="lg"
        onClick={handleDownload}
        disabled={!driveLink}
      >
        <Download className="mr-1 h-4 w-4" />
        Tải xuống qua Google Drive
      </Button>

      {hasDescription && (
        <Dialog open={descOpen} onOpenChange={setDescOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{sw.name}</DialogTitle>
            </DialogHeader>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {sw.description}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}
