'use client';

import { Modal } from './Modal';

const BINDINGS: { keys: string; action: string }[] = [
  { keys: 'Enter', action: 'Send message' },
  { keys: 'Shift + Enter', action: 'New line' },
  { keys: 'Esc', action: 'Close dialog / go back to chat list' },
  { keys: 'Ctrl/⌘ + K', action: 'Search conversations' },
  { keys: 'Ctrl/⌘ + N', action: 'New chat' },
  { keys: 'Alt + ↑ / ↓', action: 'Previous / next conversation' },
  { keys: '/', action: 'Focus the message composer' },
  { keys: '?', action: 'Show this help' },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="divide-y divide-gray-15">
        {BINDINGS.map((b) => (
          <div key={b.keys} className="flex items-center justify-between py-2.5 gap-4">
            <span className="text-sm text-gray-90">{b.action}</span>
            <kbd className="px-2 py-1 rounded bg-gray-02 border border-gray-15 text-xs font-mono text-gray-60">
              {b.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
