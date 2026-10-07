'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from './Avatar';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { Composer } from './Composer';
import { GroupInfoPanel } from './GroupInfoPanel';
import { ComingSoonModal } from './ComingSoonModal';
import { useAppStore } from '@/lib/store';
import {
  ApiError,
  getConversation,
  getMessages,
  sendReceipts,
  sendMessage,
  sendTyping,
} from '@/lib/api';
import { tickState } from '@/lib/status';
import { dayLabel, formatListTime, isSameDay } from '@/lib/time';
import type { ConversationSummary, Member, Message } from '@/lib/types';

const PAGE_SIZE = 50;
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_IDS: number[] = [];

interface ChatPaneProps {
  conversationId: number;
}

export function ChatPane({ conversationId }: ChatPaneProps) {
  const router = useRouter();
  const store = useAppStore;
  const me = useAppStore((s) => s.me);
  const storeMessages = useAppStore((s) => s.messages[conversationId] ?? EMPTY_MESSAGES);
  const typingIds = useAppStore((s) => s.typing[conversationId] ?? EMPTY_IDS);
  const presence = useAppStore((s) => s.presence);
  const userNames = useAppStore((s) => s.userNames);
  const sseEpoch = useAppStore((s) => s.sseEpoch);

  const [summary, setSummary] = useState<
    (ConversationSummary & { members: Member[] }) | null
  >(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showEncryption, setShowEncryption] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [oldestId, setOldestId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readSentRef = useRef<Set<number>>(new Set());
  const prevEpoch = useRef(sseEpoch);

  // Header meta
  const title =
    summary == null
      ? ''
      : summary.type === 'group'
        ? (summary.title ?? 'Group')
        : (summary.peer?.display_name ?? 'Unknown');
  const colorKey =
    summary == null
      ? 'A100'
      : summary.type === 'group'
        ? (summary.avatar_color ?? 'A100')
        : (summary.peer?.avatar_color ?? 'A100');
  const isGroup = summary?.type === 'group';
  const peerId = summary?.peer?.user_id ?? null;
  const presenceLine = isGroup
    ? summary != null
      ? `${summary.members.length} members`
      : ''
    : peerId != null && presence[peerId]
      ? 'online'
      : summary?.peer?.last_seen_at
        ? `last seen ${formatListTime(summary.peer.last_seen_at)}`
        : '';

  // Remember member display names for previews/sender labels
  useEffect(() => {
    if (summary?.members.length) {
      store
        .getState()
        .rememberUsers(
          summary.members.map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name,
          })),
        );
    }
  }, [summary, store]);

  // Load summary + newest page when the thread opens
  const loadLatest = useCallback(async () => {
    const [detail, messages] = await Promise.all([
      getConversation(conversationId),
      getMessages(conversationId, { limit: PAGE_SIZE }),
    ]);
    setSummary(detail);
    const s = store.getState();
    s.rememberUsers(
      messages
        .filter((m) => m.sender_name)
        .map((m) => ({ user_id: m.sender_id, display_name: m.sender_name! })),
    );
    for (const m of messages) s.applyMessageNew(m);
    if (messages.length > 0) {
      setOldestId(messages[0].message_id);
    } else {
      setOldestId(null);
    }
    setHistoryLoaded(true);
    const unread = messages
      .filter((m) => m.sender_id !== s.me?.user_id && m.status !== 'read')
      .map((m) => m.message_id);
    if (unread.length > 0) {
      readSentRef.current = new Set(unread);
      s.markRead(conversationId, unread);
      sendReceipts(conversationId, unread, 'read').catch(() => {});
    }
  }, [conversationId, store]);

  useEffect(() => {
    setSummary(null);
    setHistoryLoaded(false);
    setLoadError(null);
    setOldestId(null);
    readSentRef.current = new Set();
    store.getState().openConversation(conversationId);
    loadLatest()
      .then(() => setLoadError(null))
      .catch((err) => {
        setHistoryLoaded(true);
        setLoadError(
          err instanceof ApiError && err.status === 403
            ? 'You are not a member of this conversation'
            : 'This conversation could not be loaded',
        );
      });
  }, [conversationId, loadLatest, store]);

  // SSE reconnect: refetch the open thread
  useEffect(() => {
    if (prevEpoch.current === sseEpoch) return;
    prevEpoch.current = sseEpoch;
    if (historyLoaded) loadLatest().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseEpoch]);

  // Scroll to bottom on first load and on new outgoing/own-path messages
  useEffect(() => {
    if (historyLoaded) bottomRef.current?.scrollIntoView();
  }, [historyLoaded, conversationId]);

  // Mark visible incoming messages read whenever the list changes
  useEffect(() => {
    if (!historyLoaded || me == null) return;
    const unread = storeMessages
      .filter(
        (m) =>
          m.sender_id !== me.user_id &&
          m.status !== 'read' &&
          !readSentRef.current.has(m.message_id),
      )
      .map((m) => m.message_id);
    if (unread.length === 0) return;
    for (const id of unread) readSentRef.current.add(id);
    store.getState().markRead(conversationId, unread);
    sendReceipts(conversationId, unread, 'read').catch(() => {});
  }, [storeMessages, historyLoaded, me, conversationId, store]);

  async function loadOlder() {
    if (loadingOlder || oldestId == null) return;
    setLoadingOlder(true);
    try {
      const older = await getMessages(conversationId, {
        beforeId: oldestId,
        limit: PAGE_SIZE,
      });
      if (older.length > 0) {
        const s = store.getState();
        for (const m of older) s.applyMessageNew(m);
        setOldestId(older[0].message_id);
        // keep scroll position stable-ish: jump up by roughly one page
        scrollRef.current?.scrollTo({ top: 80 });
      } else {
        setOldestId(null);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (el != null && el.scrollTop < 60) loadOlder();
  }

  async function handleSend(body: string) {
    const clientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      message_id: -Date.now(),
      conversation_id: conversationId,
      sender_id: me?.user_id ?? -1,
      client_id: clientId,
      body,
      kind: 'text',
      created_at: Date.now(),
      status: 'sending',
    };
    store.getState().applyMessageNew(optimistic);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    try {
      const saved = await sendMessage(conversationId, clientId, body);
      // Reconcile by client_id: the optimistic row and any SSE-echoed copy of
      // this message share the same client_id, so drop them all and keep one.
      useAppStore.setState((s) => {
        const list = (s.messages[conversationId] ?? []).filter(
          (m) => m.client_id !== clientId,
        );
        return {
          messages: {
            ...s.messages,
            [conversationId]: [...list, saved].sort((a, b) =>
              a.created_at === b.created_at
                ? a.message_id - b.message_id
                : a.created_at - b.created_at,
            ),
          },
        };
      });
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      const s = store.getState();
      useAppStore.setState({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).filter(
            (m) => m.message_id !== optimistic.message_id,
          ),
        },
      });
      store.getState().pushToast('Message failed to send. Try again.');
    }
  }

  const rendered = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < storeMessages.length; i++) {
      const m = storeMessages[i];
      const prev = i > 0 ? storeMessages[i - 1] : null;
      if (prev == null || !isSameDay(prev.created_at, m.created_at)) {
        nodes.push(
          <div key={`day-${m.message_id}`} className="flex justify-center my-3 px-4">
            <span className="text-xs text-gray-60 bg-gray-02 rounded-full px-3 py-1">
              {dayLabel(m.created_at)}
            </span>
          </div>,
        );
      }
      const isMine = me != null && m.sender_id === me.user_id;
      const next = i < storeMessages.length - 1 ? storeMessages[i + 1] : null;
      const sameRun =
        next != null &&
        next.sender_id === m.sender_id &&
        next.kind === m.kind &&
        isSameDay(next.created_at, m.created_at);
      nodes.push(
        <MessageBubble
          key={m.message_id}
          message={m}
          isMine={isMine}
          showTail={!sameRun}
          tick={isMine ? tickState(m, me.user_id) : null}
          me={me}
          userNames={userNames}
        />,
      );
      if (!sameRun) nodes.push(<div key={`gap-${m.message_id}`} className="h-1" />);
    }
    return nodes;
  }, [storeMessages, me, userNames]);

  const typingNames = typingIds
    .filter((id) => me == null || id !== me.user_id)
    .map((id) => userNames[id] ?? summary?.members.find((m) => m.user_id === id)?.display_name ?? 'Someone');

  if (loadError) {
    return (
      <div className="flex flex-col h-full flex-1 min-w-0 bg-gray-02 items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <p className="text-gray-60 text-sm mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => router.push('/chats')}
          className="px-5 py-2.5 rounded-lg bg-ultramarine text-white text-sm font-medium hover:bg-ultramarine-dark"
        >
          Back to chats
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-white">
      <header className="h-[52px] px-4 flex items-center gap-3 border-b border-gray-15 shrink-0">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push('/chats')}
          className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <Avatar name={title} colorKey={colorKey} size={36} src={summary?.peer?.avatar_url ?? null} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-gray-90 truncate">{title}</div>
          {presenceLine && (
            <div className="text-xs text-gray-60 truncate">{presenceLine}</div>
          )}
        </div>
        {isGroup && (
          <button
            type="button"
            aria-label="Group info"
            onClick={() => setShowGroupInfo(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
          </button>
        )}
        <button
          type="button"
          aria-label="Encryption info"
          onClick={() => setShowEncryption(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Call"
          onClick={() => useAppStore.getState().pushToast('Voice calls — coming soon')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Video call"
          onClick={() => useAppStore.getState().pushToast('Video calls — coming soon')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <rect x="2" y="6" width="13" height="12" rx="2" />
            <path d="m16 10 5-3v10l-5-3" />
          </svg>
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-3 bg-white"
      >
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 rounded-full border-2 border-ultramarine border-t-transparent animate-spin" />
          </div>
        )}
        {rendered}
        <div ref={bottomRef} />
      </div>

      <TypingIndicator names={typingNames} />

      <Composer
        placeholder={isGroup ? 'Message the group' : 'Send a message'}
        onSend={handleSend}
        onTypingChange={(active) =>
          sendTyping(conversationId, active).catch(() => {})
        }
      />
      {showEncryption && (
        <ComingSoonModal
          title="End-to-end encryption"
          description="Messages in this demo are simulated as end-to-end encrypted — real Signal sessions, keys and sealed sender are not implemented. This is a placeholder."
          onClose={() => setShowEncryption(false)}
        />
      )}
      {showGroupInfo && summary != null && (
        <GroupInfoPanel
          conversationId={conversationId}
          title={title}
          avatarColor={colorKey}
          onClose={() => setShowGroupInfo(false)}
          onChanged={loadLatest}
        />
      )}
    </div>
  );
}
