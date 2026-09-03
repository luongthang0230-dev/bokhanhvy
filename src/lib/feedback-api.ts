import { supabase } from "@/integrations/supabase/client";
import type { FeedbackConversation, FeedbackMessage } from "./types";

const STORAGE_CONVERSATION_ID = "feedback_conversation_id";
const STORAGE_VISITOR_NAME = "feedback_visitor_name";

/** localStorage giúp khách quay lại vẫn thấy đúng cuộc trò chuyện của mình. */
export function getStoredConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_CONVERSATION_ID);
}

export function getStoredVisitorName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_VISITOR_NAME) ?? "";
}

function storeConversation(id: string, name: string) {
  window.localStorage.setItem(STORAGE_CONVERSATION_ID, id);
  window.localStorage.setItem(STORAGE_VISITOR_NAME, name);
}

/** Tạo cuộc trò chuyện mới + gửi tin nhắn góp ý đầu tiên. */
export async function startConversation(visitorName: string, message: string) {
  const { data: conversation, error: convError } = await supabase
    .from("feedback_conversations")
    .insert({ visitor_name: visitorName.trim() || "Khách" })
    .select("*")
    .single();
  if (convError) throw convError;

  const { error: msgError } = await supabase.from("feedback_messages").insert({
    conversation_id: conversation.id,
    sender_type: "visitor",
    content: message.trim(),
  });
  if (msgError) throw msgError;

  storeConversation(conversation.id, visitorName.trim() || "Khách");
  return conversation.id as string;
}

export async function sendVisitorMessage(conversationId: string, content: string) {
  const { error } = await supabase.from("feedback_messages").insert({
    conversation_id: conversationId,
    sender_type: "visitor",
    content: content.trim(),
  });
  if (error) throw error;
}

export async function sendAdminMessage(conversationId: string, content: string) {
  const { error } = await supabase.from("feedback_messages").insert({
    conversation_id: conversationId,
    sender_type: "admin",
    content: content.trim(),
  });
  if (error) throw error;
}

export async function fetchMessages(conversationId: string): Promise<FeedbackMessage[]> {
  const { data, error } = await supabase
    .from("feedback_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FeedbackMessage[];
}

/** Lắng nghe tin nhắn mới trong 1 cuộc trò chuyện (dùng cho cả khách & admin).
 *  Hậu tố ngẫu nhiên để tránh trùng tên kênh nếu lỡ mở nhiều nơi cùng lúc. */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: FeedbackMessage) => void,
) {
  const channel = supabase
    .channel(`feedback-messages-${conversationId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "feedback_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as FeedbackMessage),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Admin: danh sách hộp thư, mới nhất lên đầu. */
export async function fetchConversations(): Promise<FeedbackConversation[]> {
  const { data, error } = await supabase
    .from("feedback_conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeedbackConversation[];
}

/** Admin: lắng nghe hộp thư realtime (tin mới tới / cuộc trò chuyện mới).
 *  Tên kênh có hậu tố ngẫu nhiên để tránh trùng khi có nhiều nơi cùng subscribe
 *  (vd: badge số chưa đọc + danh sách hộp thư mở cùng lúc). */
export function subscribeToConversations(onChange: () => void) {
  const channel = supabase
    .channel(`feedback-conversations-admin-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "feedback_conversations" },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function markConversationRead(conversationId: string) {
  await supabase
    .from("feedback_conversations")
    .update({ is_read: true })
    .eq("id", conversationId);
}

export async function deleteConversation(conversationId: string) {
  const { error } = await supabase
    .from("feedback_conversations")
    .delete()
    .eq("id", conversationId);
  if (error) throw error;
}
