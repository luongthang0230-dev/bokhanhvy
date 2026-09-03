import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchConversations,
  subscribeToConversations,
  fetchMessages,
  subscribeToMessages,
  sendAdminMessage,
  markConversationRead,
  deleteConversation,
} from "@/lib/feedback-api";
import type { FeedbackConversation, FeedbackMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Hộp thư góp ý cho admin. Lưu lại mọi cuộc trò chuyện của khách (kể cả khi
 * admin không online lúc khách nhắn) — vẫn hiển thị ở đây cho tới khi admin
 * chủ động xoá. Realtime: tin nhắn mới của khách hiện ngay không cần tải lại.
 */
export function AdminFeedbackInbox() {
  const [conversations, setConversations] = useState<FeedbackConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  function reload() {
    fetchConversations()
      .then((rows) => {
        setConversations(rows);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Không tải được hộp thư góp ý");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // subscribeToConversations chỉ dùng để làm mới danh sách khi có thay đổi —
    // nếu realtime lỗi vì bất kỳ lý do gì cũng không được để crash cả tab.
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToConversations(reload);
    } catch {
      // bỏ qua — tab vẫn dùng được ở chế độ tải thủ công (bấm lại để refresh)
    }
    return unsubscribe;
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xoá cuộc trò chuyện với "${name}"? Không thể hoàn tác.`)) return;
    try {
      await deleteConversation(id);
      toast.success("Đã xoá");
      if (activeId === id) setActiveId(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xoá thất bại");
    }
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Không tải được hộp thư góp ý.</p>
          <p className="mt-1 text-destructive/80">
            {loadError.toLowerCase().includes("relation") || loadError.toLowerCase().includes("does not exist")
              ? "Có vẻ chưa chạy file FEEDBACK_SETUP.sql trên Supabase (bảng feedback_conversations chưa tồn tại). Vào SQL Editor của Supabase và chạy file đó."
              : loadError}
          </p>
        </div>
      )}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="card-surface flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <MessageCircle className="h-8 w-8" />
          Chưa có góp ý nào từ khách.
        </div>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li
              key={c.id}
              className={cn(
                "card-surface flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-secondary/60",
                !c.is_read && "border-primary/50 bg-primary/5",
              )}
              onClick={() => setActiveId(c.id)}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  c.is_read ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate", !c.is_read && "font-semibold")}>{c.visitor_name}</p>
                <p className="text-xs text-muted-foreground">{formatTime(c.last_message_at)}</p>
              </div>
              {!c.is_read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Xoá"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(c.id, c.visitor_name);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConversationThreadDialog
        conversation={conversations.find((c) => c.id === activeId) ?? null}
        onClose={() => setActiveId(null)}
        onDeleted={reload}
      />
    </div>
  );
}

function ConversationThreadDialog({
  conversation,
  onClose,
  onDeleted,
}: {
  conversation: FeedbackConversation | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    fetchMessages(conversationId).then(setMessages).catch(() => {});
    markConversationRead(conversationId).catch(() => {});
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToMessages(conversationId, (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.sender_type === "visitor") markConversationRead(conversationId).catch(() => {});
      });
    } catch {
      // realtime lỗi thì thôi, admin vẫn thấy tin khi mở lại hộp thoại
    }
    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !reply.trim() || sending) return;
    const content = reply.trim();
    setReply("");
    setSending(true);
    try {
      await sendAdminMessage(conversationId, content);
    } catch (err) {
      setReply(content);
      toast.error(err instanceof Error ? err.message : "Gửi thất bại");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={!!conversation} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[32rem] max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="truncate">{conversation?.visitor_name}</span>
            {conversation && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Xoá cuộc trò chuyện"
                onClick={async () => {
                  if (!window.confirm(`Xoá cuộc trò chuyện với "${conversation.visitor_name}"?`)) return;
                  await deleteConversation(conversation.id);
                  onDeleted();
                  onClose();
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.sender_type === "admin" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm",
                  m.sender_type === "admin"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Input
            placeholder="Trả lời khách..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={sending || !reply.trim()} aria-label="Gửi">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
