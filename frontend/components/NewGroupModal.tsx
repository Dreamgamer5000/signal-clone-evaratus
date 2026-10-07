'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { getContacts, createGroup } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

interface NewGroupModalProps {
  onClose: () => void;
}

export function NewGroupModal({ onClose }: NewGroupModalProps) {
  const router = useRouter();
  const pushToast = useAppStore((s) => s.pushToast);
  const [title, setTitle] = useState('');
  const [contacts, setContacts] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContacts()
      .then((list) => setContacts(list.map((c) => c.user)))
      .catch(() => {});
  }, []);

  function toggle(userId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function create() {
    if (title.trim().length === 0 || selected.size === 0) return;
    setBusy(true);
    try {
      const conv = await createGroup(title.trim(), [...selected]);
      onClose();
      router.push(`/chats/${conv.conversation_id}`);
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : 'Could not create group');
      setBusy(false);
    }
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <input
        type="text"
        autoFocus
        placeholder="Group name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 placeholder-gray-40 focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
      />
      <p className="text-xs text-gray-60 mt-3 mb-1">
        Members — {selected.size} selected
      </p>
      <div className="max-h-64 overflow-y-auto">
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-60 text-center py-6">
            No contacts. Add contacts first.
          </p>
        ) : (
          contacts.map((u) => {
            const checked = selected.has(u.user_id);
            return (
              <button
                key={u.user_id}
                type="button"
                onClick={() => toggle(u.user_id)}
                className="w-full h-12 px-1 flex items-center gap-3 rounded-lg hover:bg-gray-02 text-left"
              >
                <Avatar name={u.display_name} colorKey={u.avatar_color} size={40} src={u.avatar_url} />
                <span className="flex-1 text-[15px] text-gray-90 truncate">
                  {u.display_name}
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    checked ? 'bg-ultramarine border-ultramarine' : 'border-gray-25'
                  }`}
                >
                  {checked && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" aria-hidden>
                      <path d="M5 12.5 10 17.5 19 6.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
      <button
        type="button"
        onClick={create}
        disabled={busy || title.trim().length === 0 || selected.size === 0}
        className="mt-4 w-full py-3 rounded-lg bg-ultramarine text-white font-medium hover:bg-ultramarine-dark disabled:opacity-50 transition-colors"
      >
        {busy ? 'Creating…' : `Create group${selected.size ? ` (${selected.size})` : ''}`}
      </button>
    </Modal>
  );
}
