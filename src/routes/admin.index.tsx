import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { LogOut, Pencil, Plus, Trash2, ExternalLink, MessageCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/lib/use-admin";
import { softwareQuery, formatNumber } from "@/lib/api";
import { subscribeToConversations, fetchConversations } from "@/lib/feedback-api";
import { AdminFeedbackInbox } from "@/components/site/AdminFeedbackInbox";
import type { Software } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Quản trị — Lương Thắng" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

const formSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên phần mềm").max(120),
  // Mô tả ngắn / mô tả chi tiết: không giới hạn số ký tự.
  tagline: z.string().trim(),
  description: z.string().trim(),
  version: z.string().trim().max(40),
  size_label: z.string().trim().max(40),
  os: z.string().trim().max(60),
  icon_url: z.string().trim().max(500).refine((v) => !v || /^https?:\/\//.test(v), "Icon phải là URL http(s)"),
  youtube_url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => !v || /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)[\w-]{11}/.test(v) || /^[\w-]{11}$/.test(v),
      "Link YouTube không hợp lệ",
    ),
  drive_url: z.string().trim().min(1, "Nhập link Google Drive").max(1000).refine((v) => /^https?:\/\//.test(v), "Link phải bắt đầu bằng http(s)"),
});

type FormState = z.infer<typeof formSchema> & { id?: string | undefined; linkId?: string | undefined };

const emptyForm: FormState = {
  name: "",
  tagline: "",
  description: "",
  version: "",
  size_label: "",
  os: "Windows",
  icon_url: "",
  youtube_url: "",
  drive_url: "",
};

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `app-${Date.now()}`
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin, isLoading: authLoading } = useAdminAuth();
  const { data, isLoading } = useQuery(softwareQuery({ includeUnpublished: true }));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"software" | "feedback">("software");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate({ to: "/admin/login" });
  }, [authLoading, user, isAdmin, navigate]);

  // Đếm số góp ý chưa đọc để hiện badge trên tab, kể cả khi admin đang xem tab "Phần mềm".
  useEffect(() => {
    if (!user || !isAdmin) return;
    function refreshCount() {
      fetchConversations()
        .then((rows) => setUnreadCount(rows.filter((r) => !r.is_read).length))
        .catch(() => {});
    }
    refreshCount();
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToConversations(refreshCount);
    } catch {
      // bỏ qua — badge chỉ là tiện ích phụ, không được để ảnh hưởng cả trang admin
    }
    return unsubscribe;
  }, [user, isAdmin]);

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-40 w-full max-w-md rounded-xl" />
      </div>
    );
  }

  function startEdit(sw: Software) {
    const drive = sw.download_links?.find((l) => l.provider === "google-drive") ?? sw.download_links?.[0];
    setForm({
      id: sw.id,
      linkId: drive?.id,
      name: sw.name,
      tagline: sw.tagline ?? "",
      description: sw.description ?? "",
      version: sw.version ?? "",
      size_label: sw.size_label ?? "",
      os: sw.os ?? "Windows",
      icon_url: sw.icon_url ?? "",
      youtube_url: sw.youtube_url ?? "",
      drive_url: drive?.url ?? "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      // Lấy id/linkId từ `form` gốc (không phải `parsed.data`) — zod strips
      // any key not declared in formSchema, so id/linkId would otherwise
      // always come back undefined and every save would insert a new row.
      const { drive_url, ...rest } = parsed.data;
      const { id, linkId } = form;
      let softwareId = id;
      if (id) {
        const { error } = await supabase.from("software").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("software")
          .insert({ ...rest, slug: `${slugify(rest.name)}-${Date.now().toString(36)}` })
          .select("id")
          .single();
        if (error) throw error;
        softwareId = inserted.id;
      }
      if (linkId) {
        const { error } = await supabase
          .from("download_links")
          .update({ url: drive_url })
          .eq("id", linkId);
        if (error) throw error;
      } else if (softwareId) {
        const { error } = await supabase.from("download_links").insert({
          software_id: softwareId,
          label: "Google Drive",
          provider: "google-drive",
          url: drive_url,
        });
        if (error) throw error;
      }
      toast.success("Đã lưu phần mềm");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["software"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sw: Software) {
    if (!window.confirm(`Xóa "${sw.name}"?`)) return;
    const { error } = await supabase.from("software").delete().eq("id", sw.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã xóa");
      queryClient.invalidateQueries({ queryKey: ["software"] });
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <h1 className="font-display text-lg font-bold">Quản lý phần mềm</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ExternalLink className="mr-1 h-4 w-4" /> Xem trang
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-1 h-4 w-4" /> Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("software")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === "software"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Package className="h-4 w-4" /> Phần mềm
          </button>
          <button
            type="button"
            onClick={() => setTab("feedback")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === "feedback"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageCircle className="h-4 w-4" /> Góp ý
            {unreadCount > 0 && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {tab === "feedback" ? (
          <AdminFeedbackInbox />
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data?.length ?? 0} phần mềm
              </p>
              <Button
                onClick={() => {
                  setForm(emptyForm);
                  setOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Thêm phần mềm
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : (
              <ul className="space-y-3">
                {data?.map((sw) => (
                  <li key={sw.id} className="card-surface flex items-center gap-4 p-4">
                    <img
                      src={sw.icon_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${sw.slug}`}
                      alt=""
                      className="h-12 w-12 rounded-xl border border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{sw.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {sw.version && `v${sw.version} · `}
                        {formatNumber(sw.downloads)} lượt tải
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => startEdit(sw)}>
                      <Pencil className="mr-1 h-4 w-4" /> Sửa
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(sw)} aria-label="Xóa">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
                {data?.length === 0 && (
                  <li className="card-surface p-10 text-center text-sm text-muted-foreground">
                    Chưa có phần mềm nào — bấm "Thêm phần mềm" để bắt đầu.
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Sửa phần mềm" : "Thêm phần mềm"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tên phần mềm *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả ngắn</Label>
              <Textarea rows={2} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả chi tiết (không giới hạn ký tự, hiển thị khi bấm "Xem chi tiết")</Label>
              <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Link video YouTube hướng dẫn sử dụng (tuỳ chọn)</Label>
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.youtube_url}
                onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Khi có link video, video sẽ hiển thị và tự sẵn sàng phát ngay trên trang thay cho icon.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Phiên bản</Label>
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Dung lượng</Label>
                <Input placeholder="50 MB" value={form.size_label} onChange={(e) => setForm({ ...form, size_label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hệ điều hành</Label>
                <Input value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Link icon (URL ảnh, dùng khi chưa có video, có thể bỏ trống)</Label>
              <Input placeholder="https://..." value={form.icon_url} onChange={(e) => setForm({ ...form, icon_url: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Link Google Drive *</Label>
              <Input placeholder="https://drive.google.com/file/d/..." value={form.drive_url} onChange={(e) => setForm({ ...form, drive_url: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Nhớ đặt quyền chia sẻ "Bất kỳ ai có liên kết" trên Google Drive.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Đang lưu..." : "Lưu"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
