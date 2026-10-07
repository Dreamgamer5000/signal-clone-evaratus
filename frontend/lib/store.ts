import { create } from 'zustand';
import type {
  ConversationSummary,
  Message,
  Toast,
  User,
} from './types';

let toastSeq = 1;

interface AppState {
  me: User | null;
  setMe: (me: User | null) => void;

  conversations: ConversationSummary[];
  setConversations: (conversations: ConversationSummary[]) => void;

  messages: Record<number, Message[]>;
  typing: Record<number, number[]>;
  presence: Record<number, boolean>;

  toasts: Toast[];
  pushToast: (text: string) => void;
  dismissToast: (id: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  me: null,
  setMe: (me) => set({ me }),

  conversations: [],
  setConversations: (conversations) => set({ conversations }),

  messages: {},
  typing: {},
  presence: {},

  toasts: [],
  pushToast: (text) =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, text }] })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
