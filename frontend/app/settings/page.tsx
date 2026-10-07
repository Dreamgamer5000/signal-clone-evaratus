'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AVATAR_COLORS, AVATAR_COLOR_KEYS } from '@/components/Avatar';
import { ComingSoonModal } from '@/components/ComingSoonModal';
import { getSettings, patchSettings, patchMe } from '@/lib/api';
import { fetchMe, logout } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import type { User } from '@/lib/types';

type Section = 'privacy' | 'notifications' | 'appearance';

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className="w-full h-16 px-4 flex items-center gap-4 hover:bg-gray-02 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[15px] text-gray-90">{label}</div>
        <div className="text-xs text-gray-60 truncate">{description}</div>
      </div>
      <span
        role="switch"
        aria-checked={enabled}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
          enabled ? 'bg-ultramarine' : 'bg-gray-20'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const me = useAppStore((s) => s.me);
  const setMe = useAppStore((s) => s.setMe);
  const pushToast = useAppStore((s) => s.pushToast);
  const [section, setSection] = useState<Section>('privacy');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [avatarColor, setAvatarColor] = useState('A120');

  // This route can be reached directly (fresh load / shared URL), so the
  // profile must not depend on the in-memory store alone.
  useEffect(() => {
    if (me) return;
    let cancelled = false;
    fetchMe().then((user) => {
      if (cancelled) return;
      if (user) setMe(user);
      else router.replace('/login');
    });
    return () => {
      cancelled = true;
    };
  }, [me, router, setMe]);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name);
      setAbout(me.about ?? '');
      setAvatarColor(me.avatar_color);
    }
  }, [me]);

  async function setSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await patchSettings({ [key]: value });
    } catch {
      pushToast('Could not save setting');
    }
  }

  function toggle(key: string, next: boolean) {
    setSetting(key, next ? 'on' : 'off');
  }

  const on = (key: string) => (settings[key] ?? 'on') !== 'off';

  async function saveProfile() {
    try {
      const res = await patchMe({
        display_name: displayName,
        about,
        avatar_color: avatarColor,
      });
      setMe(res.user as User);
      setEditingProfile(false);
      pushToast('Profile updated');
    } catch {
      pushToast('Could not update profile');
    }
  }

  async function handleLogout() {
    await logout();
    setMe(null);
    router.replace('/login');
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-ultramarine border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="h-[52px] px-4 flex items-center gap-3 border-b border-gray-15">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push('/chats')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-60 hover:bg-gray-02"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-90 flex-1">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => setEditingProfile(true)}
          className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-02 text-left"
        >
          <Avatar name={me?.display_name ?? '?'} colorKey={me?.avatar_color ?? 'A120'} size={64} src={me?.avatar_url ?? null} />
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-90 truncate">
              {me?.display_name}
            </div>
            <div className="text-sm text-gray-60 truncate">
              @{me?.username} · {me?.phone_number}
            </div>
            {me?.about && (
              <div className="text-sm text-gray-60 truncate mt-0.5">{me.about}</div>
            )}
          </div>
          <span className="text-sm text-ultramarine font-medium">Edit</span>
        </button>

        <div className="flex gap-2 mt-6 border-b border-gray-15">
          {(['privacy', 'notifications', 'appearance'] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px ${
                section === s
                  ? 'border-ultramarine text-ultramarine'
                  : 'border-transparent text-gray-60 hover:text-gray-90'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-2 divide-y divide-gray-15">
          {section === 'privacy' && (
            <>
              <ToggleRow
                label="Read receipts"
                description="Let others see when you have read their messages"
                enabled={on('read_receipts')}
                onToggle={(v) => toggle('read_receipts', v)}
              />
              <ToggleRow
                label="Typing indicators"
                description="Let others see when you are typing"
                enabled={on('typing_indicators')}
                onToggle={(v) => toggle('typing_indicators', v)}
              />
              <ToggleRow
                label="Who can find me by number"
                description="People with your phone number can message you"
                enabled={on('find_by_phone')}
                onToggle={(v) => toggle('find_by_phone', v)}
              />
            </>
          )}
          {section === 'notifications' && (
            <>
              <ToggleRow
                label="Message notifications"
                description="Show a notification for new messages"
                enabled={on('notifications_enabled')}
                onToggle={(v) => toggle('notifications_enabled', v)}
              />
              <ToggleRow
                label="Show message preview"
                description="Include message text in notifications"
                enabled={on('notifications_preview')}
                onToggle={(v) => toggle('notifications_preview', v)}
              />
              <ToggleRow
                label="Sound"
                description="Play a sound for new messages"
                enabled={on('notifications_sound')}
                onToggle={(v) => toggle('notifications_sound', v)}
              />
            </>
          )}
          {section === 'appearance' && (
            <>
              <button
                type="button"
                onClick={() => setComingSoon('Dark mode')}
                className="w-full h-16 px-4 flex items-center gap-4 hover:bg-gray-02 text-left"
              >
                <div className="flex-1">
                  <div className="text-[15px] text-gray-90">Theme</div>
                  <div className="text-xs text-gray-60">Light — dark mode coming soon</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <ToggleRow
                label="Message bubbles show timestamps"
                description="Display the time inside each bubble"
                enabled={on('bubble_timestamps')}
                onToggle={(v) => toggle('bubble_timestamps', v)}
              />
              <button
                type="button"
                onClick={() => setComingSoon('Linked devices')}
                className="w-full h-16 px-4 flex items-center gap-4 hover:bg-gray-02 text-left"
              >
                <div className="flex-1">
                  <div className="text-[15px] text-gray-90">Linked devices</div>
                  <div className="text-xs text-gray-60">Manage desktop and tablet sessions</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 w-full py-3 rounded-lg border border-signal-red text-signal-red font-medium hover:bg-signal-red/5"
        >
          Log out
        </button>
      </div>

      {editingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingProfile(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
          >
            <h2 className="text-lg font-semibold text-gray-90 mb-4">Edit profile</h2>
            <div className="flex justify-center mb-4">
              <Avatar name={displayName || '?'} colorKey={avatarColor} size={72} />
            </div>
            <label className="block text-sm text-gray-60 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-20 mb-3 focus:outline-none focus:border-ultramarine"
            />
            <label className="block text-sm text-gray-60 mb-1">About</label>
            <input
              type="text"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-20 mb-3 focus:outline-none focus:border-ultramarine"
            />
            <label className="block text-sm text-gray-60 mb-2">Avatar color</label>
            <div className="grid grid-cols-6 gap-2 mb-5">
              {AVATAR_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => setAvatarColor(key)}
                  className={`w-9 h-9 rounded-full border-2 transition-transform ${
                    avatarColor === key ? 'border-ultramarine scale-110' : 'border-transparent'
                  }`}
                  style={{ background: AVATAR_COLORS[key].bg }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-20 text-gray-90 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                className="flex-1 py-2.5 rounded-lg bg-ultramarine text-white font-medium hover:bg-ultramarine-dark"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {comingSoon && (
        <ComingSoonModal
          title={comingSoon}
          onClose={() => setComingSoon(null)}
        />
      )}
    </div>
  );
}
