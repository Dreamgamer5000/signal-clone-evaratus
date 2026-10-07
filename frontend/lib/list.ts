import type { ConversationSummary } from './types';

export function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const la = a.last_message?.created_at ?? 0;
    const lb = b.last_message?.created_at ?? 0;
    return lb - la;
  });
}

export function filterConversations(
  items: ConversationSummary[],
  query: string,
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((c) => {
    const title = c.title?.toLowerCase() ?? '';
    const peer = c.peer?.display_name?.toLowerCase() ?? '';
    const username = c.peer?.username?.toLowerCase() ?? '';
    return title.includes(q) || peer.includes(q) || username.includes(q);
  });
}

export type ListTab = 'all' | 'unread' | 'archived';

export function applyTab(items: ConversationSummary[], tab: ListTab): ConversationSummary[] {
  switch (tab) {
    case 'all':
      return items.filter((c) => !c.is_archived);
    case 'unread':
      return items.filter((c) => !c.is_archived && c.unread_count > 0);
    case 'archived':
      return items.filter((c) => c.is_archived);
  }
}
