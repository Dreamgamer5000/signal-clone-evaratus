'use client';

import { MessageStatusTick } from './MessageStatusTick';
import type { Message, User, Attachment } from '@/lib/types';
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
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentBlock attachments={message.attachments} isMine={isMine} />
        )}
        {message.body && (
          <span className="whitespace-pre-wrap break-words">{message.body}</span>
        )}
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
