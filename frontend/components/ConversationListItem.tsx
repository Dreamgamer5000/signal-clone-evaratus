'use client';

import { Avatar } from './Avatar';
import type { ConversationSummary, User } from '@/lib/types';
import { formatListTime } from '@/lib/time';

interface ConversationListItemProps {
  conversation: ConversationSummary;
  active: boolean;
  typingUsers: number[];
  userNames: Record<number, string>;
  me: User | null;
  now?: number;
  onSelect: () => void;
}

function previewText(
  conversation: ConversationSummary,
  userNames: Record<number, string>,
  me: User | null,
): string {
  const last = conversation.last_message;
  if (!last) return '';
  const body = last.body;
  if (conversation.type === 'direct') return body;
  if (me && last.sender_id === me.user_id) return `You: ${body}`;
  const name = last.sender_name ?? userNames[last.sender_id];
  return name ? `${name}: ${body}` : body;
}

export function ConversationListItem({
  conversation,
  active,
  typingUsers,
  userNames,
  me,
  now,
  onSelect,
}: ConversationListItemProps) {
  const title =
    conversation.type === 'group'
      ? (conversation.title ?? 'Group')
      : (conversation.peer?.display_name ?? 'Unknown');
  const colorKey =
    conversation.type === 'group'
      ? (conversation.avatar_color ?? 'A100')
      : (conversation.peer?.avatar_color ?? 'A100');
  const typing = typingUsers.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full h-[72px] px-3 flex items-center gap-3 text-left transition-colors ${
        active ? 'bg-gray-05' : 'hover:bg-gray-02'
      }`}
    >
      <Avatar name={title} colorKey={colorKey} size={48} src={conversation.peer?.avatar_url ?? null} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-gray-90 truncate flex-1">
            {title}
          </span>
          {conversation.is_pinned && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-gray-45 shrink-0" aria-label="Pinned">
              <path d="M16 3l-1 5 4 4-6 2-4 5v-6l-5-5 5-1 3-4z" />
            </svg>
          )}
          <span className="text-xs text-gray-60 shrink-0">
            {conversation.last_message
              ? formatListTime(conversation.last_message.created_at, now)
              : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-sm truncate flex-1 ${
              typing ? 'text-ultramarine' : 'text-gray-60'
            }`}
          >
            {typing ? 'typing…' : previewText(conversation, userNames, me)}
          </span>
          {conversation.unread_count > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-ultramarine text-white text-xs font-medium flex items-center justify-center shrink-0">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
