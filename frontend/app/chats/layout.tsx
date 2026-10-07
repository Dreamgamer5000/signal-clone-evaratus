'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { fetchMe } from '@/lib/auth';
import { getConversations } from '@/lib/api';
import { connectSSE } from '@/lib/sse';
import { useAppStore } from '@/lib/store';
import { ConversationList } from '@/components/ConversationList';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { matchShortcut } from '@/lib/shortcuts';
import { sortConversations } from '@/lib/list';
import { NewChatModal } from '@/components/NewChatModal';
import { NewGroupModal } from '@/components/NewGroupModal';

function refreshConversations() {
  Promise.all([getConversations(false), getConversations(true)])
    .then(([active, archived]) =>
      useAppStore.getState().setConversations([...active, ...archived]),
    )
    .catch(() => {});
}

function ChatShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<'none' | 'new-chat' | 'new-group' | 'shortcuts'>('none');
  const store = useAppStore;
  const connectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((user) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      store.getState().setMe(user);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router, store]);

  useEffect(() => {
    if (!ready || connectedRef.current) return;
    connectedRef.current = true;

    refreshConversations();

    const stop = connectSSE({
      onOpen: () => {
        refreshConversations();
        store.getState().bumpSseEpoch();
      },
      onMessageNew: (message) => {
        const s = store.getState();
        const isMine = s.me != null && message.sender_id === s.me.user_id;
        const threadOpen = s.activeConversationId === message.conversation_id;
        s.applyMessageNew(message);
        if (!isMine && !threadOpen) {
          const name = s.userNames[message.sender_id] ?? 'Someone';
          s.pushToast(`New message from ${name}`);
        }
      },
      onMessageStatus: (payload) => store.getState().applyMessageStatus(payload),
      onReaction: (payload) => store.getState().applyReaction(payload),
      onTyping: (payload) => store.getState().applyTyping(payload),
      onPresence: (payload) => store.getState().applyPresence(payload),
      onConversationUpdated: refreshConversations,
    });
    return () => {
      stop();
      connectedRef.current = false;
    };
  }, [ready, store]);

  const chatOpen = /^\/chats\/\d+/.test(pathname ?? '');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target != null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const platform = /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other';
      const action = matchShortcut(e, platform);
      if (!action) return;
      if (typing && action !== 'close' && action !== 'search') return;

      switch (action) {
        case 'close':
          setModal('none');
          break;
        case 'search':
          e.preventDefault();
          document
            .querySelector<HTMLInputElement>('input[aria-label="Search"]')
            ?.focus();
          break;
        case 'new-chat':
          e.preventDefault();
          setModal('new-chat');
          break;
        case 'next-chat':
        case 'prev-chat': {
          e.preventDefault();
          const items = sortConversations(useAppStore.getState().conversations);
          if (items.length === 0) break;
          const current = useAppStore.getState().activeConversationId;
          const idx = items.findIndex((c: { conversation_id: number }) => c.conversation_id === current);
          const delta = action === 'next-chat' ? 1 : -1;
          const nextIdx =
            idx === -1
              ? 0
              : Math.min(items.length - 1, Math.max(0, idx + delta));
          const next = items[nextIdx].conversation_id;
          useAppStore.getState().openConversation(next);
          router.push(`/chats/${next}`);
          break;
        }
        case 'focus-composer': {
          if (!chatOpen) break;
          e.preventDefault();
          document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
          break;
        }
        case 'show-help':
          e.preventDefault();
          setModal('shortcuts');
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen, router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-ultramarine border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <aside
        className={`${chatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] shrink-0 border-r border-gray-15 flex-col`}
      >
        <ConversationList onNewChat={() => setModal('new-chat')} />
      </aside>
      <main className={`${chatOpen ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
        {children}
      </main>
      {modal === 'new-chat' && (
        <NewChatModal
          onClose={() => setModal('none')}
          onNewGroup={() => setModal('new-group')}
        />
      )}
      {modal === 'new-group' && (
        <NewGroupModal onClose={() => setModal('none')} />
      )}
      {modal === 'shortcuts' && (
        <ShortcutsModal onClose={() => setModal('none')} />
      )}
    </div>
  );
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <ChatShell>{children}</ChatShell>;
}
