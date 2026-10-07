'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from './SearchBar';
import { ConversationListItem } from './ConversationListItem';
import { useAppStore } from '@/lib/store';
import { filterConversations, sortConversations } from '@/lib/list';

interface ConversationListProps {
  onNewChat: () => void;
}

export function ConversationList({ onNewChat }: ConversationListProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const openConversation = useAppStore((s) => s.openConversation);
  const typing = useAppStore((s) => s.typing);
  const userNames = useAppStore((s) => s.userNames);
  const me = useAppStore((s) => s.me);

  const visible = filterConversations(sortConversations(conversations), query);

  function select(id: number) {
    openConversation(id);
    router.push(`/chats/${id}`);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-[52px] px-3 flex items-center gap-2 border-b border-gray-15 shrink-0">
        <h1 className="text-lg font-semibold text-gray-90 flex-1">Signal</h1>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/settings';
          }}
          aria-label="Settings"
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onNewChat}
          aria-label="New chat"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ultramarine hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M12 7v6M9 10h6" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-2 shrink-0">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-60">
            {query ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          visible.map((c) => (
            <ConversationListItem
              key={c.conversation_id}
              conversation={c}
              active={c.conversation_id === activeConversationId}
              typingUsers={typing[c.conversation_id] ?? []}
              userNames={userNames}
              me={me}
              onSelect={() => select(c.conversation_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
