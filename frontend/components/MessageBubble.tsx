'use client';

import { MessageStatusTick } from './MessageStatusTick';
import type { Message, User, Attachment } from '@/lib/types';
import { addReaction, removeReaction } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import type { TickState } from '@/lib/status';
import { formatBubbleTime } from '@/lib/time';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showTail: boolean;
  tick: TickState;
  me: User | null;
  userNames: Record<number, string>;
  conversationId: number;
}

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '😡'];

function ReactionChips({
  message,
  conversationId,
  me,
}: {
  message: Message;
  conversationId: number;
  me: User | null;
}) {
  const reactions = message.reactions ?? [];
  if (reactions.length === 0) return null;

  function toggle(emoji: string, mine: boolean) {
    if (!me) return;
    const call = mine
      ? removeReaction(conversationId, message.message_id, emoji)
      : addReaction(conversationId, message.message_id, emoji);
    call.then((res) => {
      const user_ids =
        res && 'user_ids' in (res as object)
          ? (res as { user_ids: number[] }).user_ids
          : (message.reactions ?? [])
              .find((r) => r.emoji === emoji)
              ?.user_ids.filter((u) => u !== me.user_id) ?? [];
      useAppStore.getState().applyReaction({
        conversation_id: conversationId,
        message_id: message.message_id,
        emoji,
        user_ids,
      });
    }).catch(() => {});
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => {
        const mine = me != null && r.user_ids.includes(me.user_id);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => toggle(r.emoji, mine)}
            title={r.user_ids.length.toString()}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
              mine ? 'border-ultramarine bg-ultramarine/10' : 'border-gray-15 bg-gray-02'
            }`}
          >
            <span>{r.emoji}</span>
            <span className="text-gray-60">{r.user_ids.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentBlock({ attachments, isMine }: { attachments: Attachment[]; isMine: boolean }) {
  return (
    <div className="mb-1 space-y-1">
      {attachments.map((a) => {
        const url = `/api/attachments/${a.attachment_id}/file`;
        if (a.mime_type.startsWith('image/')) {
          return (
            <a key={a.attachment_id} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={a.file_name}
                className="max-w-[320px] rounded-xl object-cover cursor-pointer"
                loading="lazy"
              />
            </a>
          );
        }
        return (
          <a
            key={a.attachment_id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${
              isMine ? 'border-white/30' : 'border-gray-15'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <div className="min-w-0">
              <div className="text-sm truncate">{a.file_name}</div>
              <div className={`text-xs ${isMine ? 'text-white/70' : 'text-gray-60'}`}>{formatSize(a.size_bytes)}</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function MessageBubble({
  message,
  isMine,
  showTail,
  tick,
  me,
  userNames,
  conversationId,
}: MessageBubbleProps) {
  if (message.kind === 'system') {
    return (
      <div className="flex justify-center my-2 px-4">
        <span className="text-xs text-gray-60 bg-gray-04 rounded-full px-3 py-1 text-center">
          {message.body}
        </span>
      </div>
    );
  }

  const senderName =
    !isMine && me != null
      ? (message.sender_name ?? userNames[message.sender_id] ?? 'Unknown')
      : null;

  return (
    <div className={`group flex ${isMine ? 'justify-end' : 'justify-start'} px-4`}>
      <div
        className={`relative max-w-[65%] px-3 py-2 text-[15px] leading-relaxed ${
          isMine
            ? `bg-ultramarine text-white ${showTail ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'}`
            : `bg-gray-05 text-gray-90 ${showTail ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'}`
        }`}
      >
        {senderName && (
          <div className="text-xs font-medium text-ultramarine-light mb-0.5">
            {senderName}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentBlock attachments={message.attachments} isMine={isMine} />
        )}
        {message.body && (
          <span className="whitespace-pre-wrap break-words">{message.body}</span>
        )}
        <ReactionChips message={message} conversationId={conversationId} me={me} />
        <span
          className={`inline-flex items-center gap-1 ml-2 align-bottom text-[10px] ${
            isMine ? 'text-white/70' : 'text-gray-45'
          }`}
        >
          {formatBubbleTime(message.created_at)}
          {isMine && <MessageStatusTick state={tick} />}
        </span>
      </div>
      <div
        className={`absolute top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-surface border border-gray-15 rounded-full px-1 py-0.5 shadow-sm z-10 ${
          isMine ? 'left-0 -translate-x-full mr-2' : 'right-0 translate-x-full ml-2'
        }`}
      >
        {QUICK_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`React ${e}`}
            onClick={() => {
              if (!me) return;
              addReaction(conversationId, message.message_id, e)
                .then((res) => {
                  useAppStore.getState().applyReaction({
                    conversation_id: conversationId,
                    message_id: message.message_id,
                    emoji: e,
                    user_ids: res.user_ids,
                  });
                })
                .catch(() => {});
            }}
            className="w-7 h-7 rounded-full hover:bg-gray-04 text-sm flex items-center justify-center"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
