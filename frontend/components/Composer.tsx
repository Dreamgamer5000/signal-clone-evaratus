'use client';

import { useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';

interface ComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (body: string) => Promise<void> | void;
  onTypingChange?: (active: boolean) => void;
}

export function Composer({
  disabled = false,
  placeholder = 'Send a message',
  onSend,
  onTypingChange,
}: ComposerProps) {
  const [text, setText] = useState('');
  const pushToast = useAppStore((s) => s.pushToast);
  const typingSentRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTyping(value: string) {
    setText(value);
    const active = value.trim().length > 0;
    if (active && !typingSentRef.current) {
      typingSentRef.current = true;
      onTypingChange?.(true);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => {
        if (typingSentRef.current) {
          typingSentRef.current = false;
          onTypingChange?.(false);
        }
      },
      active ? 2000 : 0,
    );
  }

  async function handleSend() {
    const body = text.trim();
    if (!body || disabled) return;
    setText('');
    if (typingSentRef.current) {
      typingSentRef.current = false;
      onTypingChange?.(false);
    }
    await onSend(body);
  }

  return (
    <div className="border-t border-gray-15 px-3 py-2 flex items-end gap-2 bg-white shrink-0">
      <button
        type="button"
        aria-label="Emoji"
        onClick={() => pushToast('Emoji picker — coming soon')}
        disabled={disabled}
        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02 disabled:opacity-50 shrink-0"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
          <path d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Attach"
        onClick={() => pushToast('Attachments — coming soon')}
        disabled={disabled}
        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02 disabled:opacity-50 shrink-0"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
      <textarea
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => handleTyping(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        className="flex-1 resize-none max-h-32 px-3 py-2.5 rounded-2xl bg-gray-02 text-gray-90 placeholder-gray-45 text-[15px] focus:outline-none focus:ring-2 focus:ring-ultramarine/20"
      />
      <button
        type="button"
        aria-label="Voice message"
        onClick={() => pushToast('Voice messages — coming soon')}
        disabled={disabled}
        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02 disabled:opacity-50 shrink-0"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Send"
        onClick={handleSend}
        disabled={disabled || text.trim().length === 0}
        className="w-10 h-10 rounded-full bg-ultramarine text-white flex items-center justify-center hover:bg-ultramarine-dark disabled:opacity-50 shrink-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
