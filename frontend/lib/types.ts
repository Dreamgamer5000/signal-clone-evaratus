export interface User {
  user_id: number;
  phone_number: string;
  username: string;
  display_name: string;
  about: string | null;
  avatar_color: string;
  avatar_url: string | null;
  last_seen_at: number | null;
  created_at: number;
}

export interface Contact {
  contact_id: number;
  owner_id: number;
  contact_user_id: number;
  nickname: string | null;
  created_at: number;
  user: User;
}

export type MessageKind = 'text' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Reaction {
  emoji: string;
  user_ids: number[];
}

export interface ReplyPreview {
  message_id: number | null;
  sender_name: string | null;
  body: string | null;
  deleted: boolean;
}

export interface Attachment {
  attachment_id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface Message {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  client_id: string;
  body: string;
  kind: MessageKind;
  created_at: number;
  status: MessageStatus;
  sender_name?: string | null;
  attachments?: Attachment[];
  reactions?: Reaction[];
  reply_to?: ReplyPreview | null;
}

export interface ConversationSummary {
  conversation_id: number;
  type: 'direct' | 'group';
  title: string | null;
  avatar_color: string | null;
  peer: User | null;
  last_message: Message | null;
  unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
}

export interface Member {
  user_id: number;
  role: 'admin' | 'member';
  joined_at: number;
  display_name: string;
  username: string;
  about: string | null;
  avatar_color: string;
  last_seen_at: number | null;
}

export interface Toast {
  id: number;
  text: string;
}

export interface SseMessageNew {
  type: 'message.new';
  payload: Message;
}

export interface SseMessageStatus {
  type: 'message.status';
  payload: {
    conversation_id: number;
    message_ids: number[];
    user_id: number;
    status: 'delivered' | 'read';
  };
}

export interface SseTypingUpdate {
  type: 'typing.update';
  payload: {
    conversation_id: number;
    user_id: number;
    active: boolean;
  };
}

export interface SsePresenceUpdate {
  type: 'presence.update';
  payload: {
    user_id: number;
    online: boolean;
    last_seen_at: number | null;
  };
}

export interface SseConversationUpdated {
  type: 'conversation.updated';
  payload: {
    conversation_id: number;
    reason: string;
  };
}

export type SseEvent =
  | SseMessageNew
  | SseMessageStatus
  | SseTypingUpdate
  | SsePresenceUpdate
  | SseConversationUpdated;
