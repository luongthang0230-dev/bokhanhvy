-- ============================================================================
-- FEEDBACK_SETUP.sql — Chạy file này 1 LẦN trong SQL Editor của project
-- Supabase HIỆN TẠI (project bạn đã setup xong) để bổ sung tính năng
-- "Góp ý" (chat bong bóng, không cần đăng nhập) + Hộp thư admin.
-- Không cần chạy lại SETUP.sql cũ — file này chỉ thêm 2 bảng mới.
-- ============================================================================

-- Mỗi lượt chat của 1 khách là 1 "conversation". Khách không đăng nhập nên
-- không có user_id — conversation được nhận diện bằng chính uuid của nó,
-- lưu trong localStorage trình duyệt khách (giống cơ chế "share link").
create table public.feedback_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null default 'Khách',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  is_read boolean not null default false
);
grant select, insert on public.feedback_conversations to anon;
grant select, insert, update, delete on public.feedback_conversations to authenticated;
grant all on public.feedback_conversations to service_role;
alter table public.feedback_conversations enable row level security;
create policy "public read conversations" on public.feedback_conversations for select using (true);
create policy "anon create conversation" on public.feedback_conversations for insert to anon with check (true);
create policy "admin update conversations" on public.feedback_conversations for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete conversations" on public.feedback_conversations for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.feedback_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor','admin')),
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.feedback_messages to anon;
grant select, insert, update, delete on public.feedback_messages to authenticated;
grant all on public.feedback_messages to service_role;
alter table public.feedback_messages enable row level security;
create policy "public read messages" on public.feedback_messages for select using (true);
create policy "anon insert visitor messages" on public.feedback_messages for insert to anon
  with check (sender_type = 'visitor');
create policy "admin insert messages" on public.feedback_messages for insert to authenticated
  with check (sender_type = 'admin' and public.has_role(auth.uid(),'admin'));
create policy "admin delete messages" on public.feedback_messages for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));
create index feedback_messages_conversation_idx on public.feedback_messages(conversation_id);

-- Mỗi khi có tin nhắn mới: cập nhật last_message_at, và đánh dấu "chưa đọc"
-- cho admin chỉ khi người gửi là khách (tin admin tự gửi thì không tính unread).
create or replace function public.touch_feedback_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_conversations
  set last_message_at = new.created_at,
      is_read = (new.sender_type = 'admin')
  where id = new.conversation_id;
  return new;
end; $$;
revoke all on function public.touch_feedback_conversation() from public, anon, authenticated;
create trigger t_feedback_message_insert
  after insert on public.feedback_messages
  for each row execute function public.touch_feedback_conversation();

-- Bật realtime để khách và admin thấy tin nhắn mới ngay lập tức, không cần refresh.
alter publication supabase_realtime add table public.feedback_conversations;
alter publication supabase_realtime add table public.feedback_messages;
