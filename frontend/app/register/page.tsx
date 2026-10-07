'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { register } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Avatar, AVATAR_COLORS, AVATAR_COLOR_KEYS } from '@/components/Avatar';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setMe = useAppStore((s) => s.setMe);
  const [phone, setPhone] = useState(params.get('phone') ?? '');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState('A120');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await register({
        phone_number: phone,
        username,
        display_name: displayName,
        avatar_color: avatarColor,
      });
      setMe(res.user);
      router.push('/chats');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex justify-center">
        <Avatar name={displayName || username || '?'} colorKey={avatarColor} size={88} />
      </div>

      <div>
        <label className="block text-sm text-gray-60 mb-1">Phone number</label>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-60 mb-1">Username</label>
        <input
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-60 mb-1">Display name</label>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-60 mb-2">Avatar color</label>
        <div className="grid grid-cols-6 gap-2">
          {AVATAR_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => setAvatarColor(key)}
              className={`w-9 h-9 rounded-full border-2 transition-transform ${
                avatarColor === key
                  ? 'border-ultramarine scale-110'
                  : 'border-transparent'
              }`}
              style={{ background: AVATAR_COLORS[key].bg }}
            />
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 rounded-lg bg-ultramarine text-white font-medium hover:bg-ultramarine-dark disabled:opacity-50 transition-colors"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>

      {error && <p className="text-sm text-signal-red text-center">{error}</p>}
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gray-02 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center text-gray-90 mb-2">
          Set up your profile
        </h1>
        <p className="text-sm text-gray-60 text-center mb-8">
          Choose a username, display name and avatar.
        </p>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
