'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from './SearchBar';
import { ConversationListItem } from './ConversationListItem';
import { ComingSoonModal } from './ComingSoonModal';
import { resolveTheme, applyTheme } from '@/lib/theme';
import { useAppStore } from '@/lib/store';
import { filterConversations, sortConversations, applyTab, type ListTab } from '@/lib/list';

interface ConversationListProps {
  onNewChat: () => void;
}

const TABS: { key: ListTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
];

export function ConversationList({ onNewChat }: ConversationListProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ListTab>('all');
  const [storiesOpen, setStoriesOpen] = useState(false);
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const openConversation = useAppStore((s) => s.openConversation);
  const typing = useAppStore((s) => s.typing);
  const userNames = useAppStore((s) => s.userNames);
  const me = useAppStore((s) => s.me);

  const visible = filterConversations(
    applyTab(sortConversations(conversations), tab),
    query,
  );

  function select(id: number) {
    openConversation(id);
    router.push(`/chats/${id}`);
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="h-[52px] px-3 flex items-center gap-2 border-b border-gray-15 shrink-0">
        <h1 className="text-lg font-semibold text-gray-90 flex-1">Signal</h1>
        <button
          type="button"
          aria-label="Toggle theme"
          title="Toggle light/dark"
          onClick={() => {
            const isDark = document.documentElement.dataset.theme === 'dark';
            const next = isDark ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            applyTheme(next);
            fetch('/api/settings', {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ theme: next }),
            }).catch(() => {});
          }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            router.push('/settings');
          }}
          aria-label="Settings"
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9v.1a1.7 1.7 0 0 0-1.5 1H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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

      <div className="px-3 pb-2 flex gap-1 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-ultramarine text-white'
                : 'bg-gray-04 text-gray-60 hover:bg-gray-05'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'all' && query.trim() === '' && (
          <button
            type="button"
            onClick={() => setStoriesOpen(true)}
            className="w-full h-[72px] px-3 flex items-center gap-3 text-left hover:bg-gray-02"
          >
            <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-ultramarine to-signal-red shrink-0">
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-gray-45">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-gray-90">Stories</div>
              <div className="text-sm text-gray-60 truncate">Share photos and text — coming soon</div>
            </div>
          </button>
        )}

        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-60">
            {query
              ? 'No conversations found'
              : tab === 'unread'
                ? 'No unread conversations'
                : tab === 'archived'
                  ? 'No archived conversations'
                  : 'No conversations yet'}
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

      {storiesOpen && (
        <ComingSoonModal
          title="Stories"
          description="Stories let you share photos and text that disappear after 24 hours. Coming soon in this demo."
          onClose={() => setStoriesOpen(false)}
        />
      )}
    </div>
  );
}
