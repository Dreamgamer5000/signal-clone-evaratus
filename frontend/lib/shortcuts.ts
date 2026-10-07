export type Shortcut =
  | 'close'
  | 'search'
  | 'new-chat'
  | 'next-chat'
  | 'prev-chat'
  | 'focus-composer'
  | 'show-help';

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type Platform = 'mac' | 'other';

export function matchShortcut(e: ShortcutEvent, platform: Platform): Shortcut | null {
  const mod = platform === 'mac' ? e.metaKey : e.ctrlKey;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

  if (e.key === 'Escape') return 'close';
  if (mod && !e.altKey && e.key.toLowerCase() === 'k') return 'search';
  if (mod && !e.altKey && e.key.toLowerCase() === 'n') return 'new-chat';
  if (e.altKey && !mod && e.key === 'ArrowDown') return 'next-chat';
  if (e.altKey && !mod && e.key === 'ArrowUp') return 'prev-chat';
  if (plain && e.key === '/') return 'focus-composer';
  if (plain && e.key === '?' && e.shiftKey) return 'show-help';
  return null;
}
