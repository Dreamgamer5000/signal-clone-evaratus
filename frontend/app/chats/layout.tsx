'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { fetchMe } from '@/lib/auth';
import { getConversations } from '@/lib/api';
import { connectSSE } from '@/lib/sse';
import { useAppStore } from '@/lib/store';
import { ConversationList } from '@/components/ConversationList';
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
  const [modal, setModal] = useState<'none' | 'new-chat' | 'new-group'>('none');
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-ultramarine border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
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
    </div>
  );
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <ChatShell>{children}</ChatShell>;
}
