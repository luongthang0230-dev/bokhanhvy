import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getStoredConversationId,
  getStoredVisitorName,
  fetchMessages,
  startConversation,
  sendVisitorMessage,
  subscribeToMessages,
} from "@/lib/feedback-api";
import type { FeedbackMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_HINT_DISMISSED = "feedback_hint_dismissed";

/**
 * Bong bóng góp ý nổi góc dưới phải, giống khung chat Messenger. Khách không
 * cần đăng nhập: chỉ nhập Tên + Góp ý là bắt đầu được cuộc trò chuyện, sau
 * đó chat 2 chiều realtime với admin. Nếu admin chưa online, tin nhắn vẫn
 * được lưu lại và hiện trong hộp thư admin cho tới khi admin xoá.
 */
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState("");
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Form khởi tạo (chưa có cuộc trò chuyện)
  const [startName, setStartName] = useState("");
  const [startMessage, setStartMessage] = useState("");

  // Ô nhập cho cuộc trò chuyện đang diễn ra
  const [reply, setReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Khôi phục cuộc trò chuyện đã có từ trước (localStorage)
  useEffect(() => {
    const storedId = getStoredConversationId();
    if (storedId) {
      setConversationId(storedId);
      setVisitorName(getStoredVisitorName());
    }
    // Chữ gợi ý chỉ hiện nếu khách chưa từng tắt nó đi.
    if (!window.localStorage.getItem(STORAGE_HINT_DISMISSED)) setShowHint(true);
  }, []);

  // Tải lịch sử tin nhắn + đăng ký realtime khi có conversationId
  useEffect(() => {
    if (!conversationId) return;
    let unsubscribe = () => {};
    fetchMessages(conversationId)
      .then(setMessages)
      .catch(() => {});
    try {
      unsubscribe = subscribeToMessages(conversationId, (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.sender_type === "admin" && !open) setHasUnseen(true);
      });
    } catch {
      // realtime lỗi thì thôi, khách vẫn gửi/nhận được khi mở lại khung chat
    }
    return unsubscribe;
  }, [conversationId, open]);

  // Cuộn xuống cuối khi có tin nhắn mới hoặc mở khung chat
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function toggleOpen() {
    setOpen((v) => !v);
    setHasUnseen(false);
    dismissHint();
  }

  function dismissHint() {
    setShowHint(false);
    window.localStorage.setItem(STORAGE_HINT_DISMISSED, "1");
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!startName.trim() || !startMessage.trim() || loading) return;
    setLoading(true);
    try {
      const id = await startConversation(startName, startMessage);
      setConversationId(id);
      setVisitorName(startName.trim() || "Khách");
      setStartName("");
      setStartMessage("");
    } catch {
      // im lặng bỏ qua lỗi mạng tạm thời, người dùng có thể bấm gửi lại
    } finally {
      setLoading(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !reply.trim() || loading) return;
    const content = reply.trim();
    setReply("");
    setLoading(true);
    try {
      await sendVisitorMessage(conversationId, content);
    } catch {
      setReply(content);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="brand-gradient flex items-center justify-between px-4 py-3 text-primary-foreground">
            <div>
              <p className="font-display text-sm font-semibold">Góp ý cho chúng tôi</p>
              <p className="text-xs opacity-90">Thường trả lời trong thời gian sớm nhất</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="rounded-full p-1 hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!conversationId ? (
            <form onSubmit={handleStart} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground">
                Để lại lời nhắn, chúng tôi sẽ phản hồi ngay tại đây — không cần đăng nhập.
              </p>
              <Input
                placeholder="Tên của bạn"
                value={startName}
                onChange={(e) => setStartName(e.target.value)}
                maxLength={80}
                required
              />
              <Textarea
                placeholder="Nội dung góp ý..."
                rows={4}
                value={startMessage}
                onChange={(e) => setStartMessage(e.target.value)}
                maxLength={2000}
                required
                className="flex-1 resize-none"
              />
              <Button type="submit" className="brand-gradient text-primary-foreground" disabled={loading}>
                {loading ? "Đang gửi..." : "Gửi góp ý"}
              </Button>
            </form>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.sender_type === "visitor" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm",
                        m.sender_type === "visitor"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleReply} className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  placeholder="Nhập tin nhắn..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={2000}
                />
                <Button type="submit" size="icon" disabled={loading || !reply.trim()} aria-label="Gửi">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-0">
        {showHint && !open && (
          <div className="relative mr-2 flex items-center">
            <button
              type="button"
              onClick={toggleOpen}
              className="whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg"
            >
              Chat với admin
            </button>
            {/* Mũi tên nhỏ trỏ sang bong bóng chat */}
            <span className="-ml-[5px] h-3 w-3 rotate-45 bg-foreground" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissHint();
              }}
              aria-label="Đóng gợi ý"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={toggleOpen}
          aria-label={open ? "Đóng khung góp ý" : "Mở khung góp ý"}
          className="brand-gradient relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-xl transition-transform hover:scale-105"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {hasUnseen && !open && (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive" />
          )}
        </button>
      </div>
    </div>
  );
}
