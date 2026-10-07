'use client';

import { MessageStatusTick } from './MessageStatusTick';
import type { Message, User } from '@/lib/types';
import type { TickState } from '@/lib/status';
import { formatBubbleTime } from '@/lib/time';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showTail: boolean;
  tick: TickState;
  me: User | null;
  userNames: Record<number, string>;
}

export function MessageBubble({
  message,
  isMine,
  showTail,
  tick,
  me,
  userNames,
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
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-4`}>
      <div
        className={`max-w-[65%] px-3 py-2 text-[15px] leading-relaxed ${
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
        <span className="whitespace-pre-wrap break-words">{message.body}</span>
        <span
          className={`inline-flex items-center gap-1 ml-2 align-bottom text-[10px] ${
            isMine ? 'text-white/70' : 'text-gray-45'
          }`}
        >
          {formatBubbleTime(message.created_at)}
          {isMine && <MessageStatusTick state={tick} />}
        </span>
      </div>
    </div>
  );
}
