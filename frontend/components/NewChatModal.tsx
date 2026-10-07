'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { SearchBar } from './SearchBar';
import { getContacts, addContact, createDirect, searchUsers } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import type { User } from '@/lib/types';
import { ApiError } from '@/lib/api';

interface ContactRow {
  contact_id: number;
  user: User;
  nickname: string | null;
}

interface NewChatModalProps {
  onClose: () => void;
  onNewGroup: () => void;
}

export function NewChatModal({ onClose, onNewGroup }: NewChatModalProps) {
  const router = useRouter();
  const pushToast = useAppStore((s) => s.pushToast);
  const rememberUsers = useAppStore((s) => s.rememberUsers);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [results, setResults] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContacts()
      .then((list) => {
        setContacts(list as unknown as ContactRow[]);
        rememberUsers(list.map((c) => c.user));
      })
      .catch(() => {});
  }, [rememberUsers]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchUsers(q).then(setResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function openWith(user: User) {
    setBusy(true);
    try {
      const conv = await createDirect(user.user_id);
      onClose();
      router.push(`/chats/${conv.conversation_id}`);
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : 'Could not start chat');
      setBusy(false);
    }
  }

  async function inviteByPhone() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      await addContact(q);
      pushToast('Contact added');
      setQuery('');
      const list = await getContacts();
      setContacts(list as unknown as ContactRow[]);
      rememberUsers(list.map((c) => c.user));
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : 'Could not add contact');
    } finally {
      setBusy(false);
    }
  }

  const filtered = contacts.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.user.display_name.toLowerCase().includes(q) ||
      c.user.username.toLowerCase().includes(q) ||
      (c.nickname ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <Modal title="New chat" onClose={onClose}>
      <SearchBar value={query} onChange={setQuery} placeholder="Search or enter a number" />
      <button
        type="button"
        onClick={onNewGroup}
        className="mt-3 w-full h-12 px-3 flex items-center gap-3 rounded-lg hover:bg-gray-02 text-left"
      >
        <div className="w-10 h-10 rounded-full bg-ultramarine text-white flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <span className="text-[15px] font-medium text-gray-90">New group</span>
      </button>

      <div className="mt-2 border-t border-gray-15 pt-2">
        {results.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-gray-60 px-1 py-1">Search results</p>
            {results.map((u) => (
              <UserRow key={u.user_id} user={u} disabled={busy} onClick={() => openWith(u)} />
            ))}
          </div>
        )}
        <p className="text-xs text-gray-60 px-1 py-1">Contacts</p>
        {filtered.length === 0 ? (
          <div className="px-1 py-6 text-center text-sm text-gray-60">
            {query.trim()
              ? 'No contacts match. Add a contact by phone number:'
              : 'No contacts yet'}
            {query.trim() && (
              <button
                type="button"
                onClick={inviteByPhone}
                disabled={busy}
                className="mt-2 block mx-auto px-4 py-2 rounded-lg bg-ultramarine text-white text-sm font-medium hover:bg-ultramarine-dark disabled:opacity-50"
              >
                Add &ldquo;{query.trim()}&rdquo; as contact
              </button>
            )}
          </div>
        ) : (
          filtered.map((c) => (
            <UserRow
              key={c.contact_id}
              user={c.user}
              label={c.nickname ?? c.user.display_name}
              disabled={busy}
              onClick={() => openWith(c.user)}
            />
          ))
        )}
      </div>
    </Modal>
  );
}

function UserRow({
  user,
  label,
  disabled,
  onClick,
}: {
  user: User;
  label?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full h-12 px-1 flex items-center gap-3 rounded-lg hover:bg-gray-02 text-left disabled:opacity-50"
    >
      <Avatar name={label ?? user.display_name} colorKey={user.avatar_color} size={40} src={user.avatar_url} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] text-gray-90 truncate">{label ?? user.display_name}</div>
        <div className="text-xs text-gray-60 truncate">@{user.username}</div>
      </div>
    </button>
  );
}
