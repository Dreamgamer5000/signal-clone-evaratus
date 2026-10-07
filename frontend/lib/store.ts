import { create } from 'zustand';
import type {
  ConversationSummary,
  Message,
  MessageStatus,
  Toast,
  User,
} from './types';

let toastSeq = 1;

const typingTimers: Record<number, ReturnType<typeof setTimeout>> = {};

interface AppState {
  me: User | null;
  setMe: (me: User | null) => void;

  conversations: ConversationSummary[];
  setConversations: (conversations: ConversationSummary[]) => void;

  userNames: Record<number, string>;
  rememberUsers: (users: { user_id: number; display_name: string }[]) => void;

  messages: Record<number, Message[]>;
  typing: Record<number, number[]>;
  presence: Record<number, boolean>;

  sseEpoch: number;
  bumpSseEpoch: () => void;

  activeConversationId: number | null;
  openConversation: (id: number) => void;
  closeConversation: () => void;

  toasts: Toast[];
  pushToast: (text: string) => void;
  dismissToast: (id: number) => void;

  applyMessageNew: (message: Message) => void;
  applyMessageStatus: (payload: {
    conversation_id: number;
    message_ids: number[];
    user_id: number;
    status: MessageStatus;
  }) => void;
  applyTyping: (payload: {
    conversation_id: number;
    user_id: number;
    active: boolean;
  }) => void;
  applyPresence: (payload: {
    user_id: number;
    online: boolean;
    last_seen_at: number | null;
  }) => void;
  markRead: (conversationId: number, messageIds: number[]) => void;

  applyReaction: (payload: {
    conversation_id: number;
    message_id: number;
    emoji: string;
    user_ids: number[];
  }) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  me: null,
  setMe: (me) => set({ me }),

  conversations: [],
  setConversations: (conversations) => set({ conversations }),

  userNames: {},
  rememberUsers: (users) =>
    set((s) => {
      const next = { ...s.userNames };
      let changed = false;
      for (const u of users) {
        if (next[u.user_id] !== u.display_name) {
          next[u.user_id] = u.display_name;
          changed = true;
        }
      }
      return changed ? { userNames: next } : s;
    }),

  messages: {},
  typing: {},
  presence: {},

  sseEpoch: 0,
  bumpSseEpoch: () => set((s) => ({ sseEpoch: s.sseEpoch + 1 })),

  activeConversationId: null,
  openConversation: (id) => set({ activeConversationId: id }),
  closeConversation: () => set({ activeConversationId: null }),

  toasts: [],
  pushToast: (text) =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, text }] })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  applyMessageNew: (message) =>
    set((s) => {
      const list = s.messages[message.conversation_id] ?? [];
      const next = list.some((m) => m.message_id === message.message_id)
        ? list
        : [...list, message].sort((a, b) =>
            a.created_at === b.created_at
              ? a.message_id - b.message_id
              : a.created_at - b.created_at,
          );

      const isMine = s.me != null && message.sender_id === s.me.user_id;
      const threadOpen = s.activeConversationId === message.conversation_id;
      const conversations = s.conversations.map((c) =>
        c.conversation_id === message.conversation_id
          ? {
              ...c,
              last_message: message,
              unread_count:
                !isMine && !threadOpen ? c.unread_count + 1 : c.unread_count,
            }
          : c,
      );

      return {
        messages: { ...s.messages, [message.conversation_id]: next },
        conversations,
      };
    }),

  applyMessageStatus: (payload) =>
    set((s) => {
      const list = s.messages[payload.conversation_id];
      if (!list) return s;
      return {
        messages: {
          ...s.messages,
          [payload.conversation_id]: list.map((m) =>
            payload.message_ids.includes(m.message_id) &&
            payload.status === 'read'
              ? { ...m, status: 'read' as const }
              : payload.message_ids.includes(m.message_id) &&
                  m.status !== 'read'
                ? { ...m, status: payload.status }
                : m,
          ),
        },
      };
    }),

  applyTyping: (payload) =>
    set((s) => {
      const current = s.typing[payload.conversation_id] ?? [];
      const others = current.filter((u) => u !== payload.user_id);

      if (typingTimers[payload.conversation_id]) {
        clearTimeout(typingTimers[payload.conversation_id]);
        delete typingTimers[payload.conversation_id];
      }
      if (payload.active) {
        typingTimers[payload.conversation_id] = setTimeout(() => {
          set((st) => ({
            typing: {
              ...st.typing,
              [payload.conversation_id]: (
                st.typing[payload.conversation_id] ?? []
              ).filter((u) => u !== payload.user_id),
            },
          }));
        }, 5000);
      }

      return {
        typing: {
          ...s.typing,
          [payload.conversation_id]: payload.active
            ? [...others, payload.user_id]
            : others,
        },
      };
    }),

  applyPresence: (payload) =>
    set((s) => ({ presence: { ...s.presence, [payload.user_id]: payload.online } })),

  applyReaction: (payload) =>
    set((s) => {
      const list = s.messages[payload.conversation_id];
      if (!list) return s;
      return {
        messages: {
          ...s.messages,
          [payload.conversation_id]: list.map((m) => {
            if (m.message_id !== payload.message_id) return m;
            const others = (m.reactions ?? []).filter((r) => r.emoji !== payload.emoji);
            return {
              ...m,
              reactions:
                payload.user_ids.length > 0
                  ? [...others, { emoji: payload.emoji, user_ids: payload.user_ids }]
                  : others,
            };
          }),
        },
      };
    }),

  markRead: (conversationId, messageIds) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          messageIds.includes(m.message_id)
            ? { ...m, status: 'read' as const }
            : m,
        ),
      },
      conversations: s.conversations.map((c) =>
        c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
    })),
}));
