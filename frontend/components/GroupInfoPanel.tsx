'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import {
  addMember,
  getContacts,
  getMembers,
  removeMember,
  setMemberRole,
} from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { ApiError } from '@/lib/api';
import type { Member, User } from '@/lib/types';

interface GroupInfoPanelProps {
  conversationId: number;
  title: string;
  avatarColor: string;
  onClose: () => void;
  onChanged: () => void;
}

export function GroupInfoPanel({
  conversationId,
  title,
  avatarColor,
  onClose,
  onChanged,
}: GroupInfoPanelProps) {
  const me = useAppStore((s) => s.me);
  const pushToast = useAppStore((s) => s.pushToast);
  const [members, setMembers] = useState<Member[]>([]);
  const [addable, setAddable] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const myRole = members.find((m) => m.user_id === me?.user_id)?.role;
  const isAdmin = myRole === 'admin';

  async function refresh() {
    try {
      const [list, contacts] = await Promise.all([getMembers(conversationId), getContacts()]);
      setMembers(list);
      const memberIds = new Set(list.map((m) => m.user_id));
      setAddable(contacts.map((c) => c.user).filter((u) => !memberIds.has(u.user_id)));
    } catch {
      pushToast('Could not load group info');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function run(action: () => Promise<unknown>, okToast: string) {
    setBusy(true);
    try {
      await action();
      pushToast(okToast);
      await refresh();
      onChanged();
    } catch (err) {
      pushToast(err instanceof ApiError ? err.detail : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Group info" onClose={onClose} wide>
      <div className="flex items-center gap-3 pb-3 border-b border-gray-15">
        <Avatar name={title} colorKey={avatarColor} size={56} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold text-gray-90 truncate">{title}</div>
          <div className="text-sm text-gray-60">{members.length} members</div>
        </div>
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          disabled={busy}
          className="mt-3 w-full h-11 px-3 flex items-center gap-3 rounded-lg hover:bg-gray-02 text-ultramarine text-[15px] font-medium"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add members
        </button>
      )}

      {showAdd && isAdmin && (
        <div className="mt-2 border border-gray-15 rounded-lg p-2">
          {addable.length === 0 ? (
            <p className="text-sm text-gray-60 text-center py-3">
              All your contacts are already members
            </p>
          ) : (
            addable.map((u) => (
              <button
                key={u.user_id}
                type="button"
                disabled={busy}
                onClick={() => run(() => addMember(conversationId, u.user_id), `Added ${u.display_name}`)}
                className="w-full h-11 px-2 flex items-center gap-3 rounded-lg hover:bg-gray-02 text-left disabled:opacity-50"
              >
                <Avatar name={u.display_name} colorKey={u.avatar_color} size={32} src={u.avatar_url} />
                <span className="flex-1 text-sm text-gray-90 truncate">{u.display_name}</span>
                <span className="text-xs text-ultramarine font-medium">Add</span>
              </button>
            ))
          )}
        </div>
      )}

      <p className="text-xs text-gray-60 mt-4 mb-1">Members</p>
      <div>
        {members.map((m) => (
          <div key={m.user_id} className="h-12 px-1 flex items-center gap-3 rounded-lg hover:bg-gray-02">
            <Avatar name={m.display_name} colorKey={m.avatar_color} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] text-gray-90 truncate">
                {m.user_id === me?.user_id ? `${m.display_name} (You)` : m.display_name}
              </div>
              <div className="text-xs text-gray-60 truncate">@{m.username}</div>
            </div>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                m.role === 'admin'
                  ? 'bg-ultramarine/10 text-ultramarine'
                  : 'bg-gray-04 text-gray-60'
              }`}
            >
              {m.role}
            </span>
            {isAdmin && m.user_id !== me?.user_id && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        setMemberRole(
                          conversationId,
                          m.user_id,
                          m.role === 'admin' ? 'member' : 'admin',
                        ),
                      m.role === 'admin' ? 'Demoted to member' : 'Promoted to admin',
                    )
                  }
                  className="text-xs text-ultramarine font-medium px-2 py-1 rounded hover:bg-ultramarine/10 disabled:opacity-50"
                >
                  {m.role === 'admin' ? 'Demote' : 'Promote'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => removeMember(conversationId, m.user_id),
                      `Removed ${m.display_name}`,
                    )
                  }
                  className="text-xs text-signal-red font-medium px-2 py-1 rounded hover:bg-signal-red/10 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
