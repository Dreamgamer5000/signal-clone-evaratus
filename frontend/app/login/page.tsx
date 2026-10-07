'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startOtp, verifyOtp } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setMe = useAppStore((s) => s.setMe);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await startOtp(phone);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await verifyOtp(phone, code);
      setMe(res.user);
      router.push('/chats');
    } catch (err) {
      if (err instanceof ApiError && err.status === 428) {
        router.push(`/register?phone=${encodeURIComponent(phone)}`);
        return;
      }
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-02 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-ultramarine flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white" aria-hidden>
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-center text-gray-90 mb-1">
          {step === 'phone' ? 'Enter your phone number' : 'Enter the code we sent'}
        </h1>
        <p className="text-sm text-gray-60 text-center mb-8">
          {step === 'phone'
            ? 'Signal will send you a verification code. (Demo: any number works.)'
            : 'For this demo, the code is always 123456.'}
        </p>

        {step === 'phone' ? (
          <form onSubmit={handlePhone} className="space-y-4">
            <input
              type="tel"
              autoFocus
              required
              placeholder="+1 555 000 0001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 placeholder-gray-40 focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
            />
            <button
              type="submit"
              disabled={busy || phone.trim().length === 0}
              className="w-full py-3 rounded-lg bg-ultramarine text-white font-medium hover:bg-ultramarine-dark disabled:opacity-50 transition-colors"
            >
              {busy ? 'Sending…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCode} className="space-y-4">
            <input
              type="text"
              autoFocus
              required
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-20 text-gray-90 placeholder-gray-40 text-center tracking-widest focus:outline-none focus:border-ultramarine focus:ring-2 focus:ring-ultramarine/20"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="w-full py-3 rounded-lg bg-ultramarine text-white font-medium hover:bg-ultramarine-dark disabled:opacity-50 transition-colors"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setError('');
              }}
              className="w-full py-2 text-ultramarine text-sm font-medium"
            >
              Change phone number
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-signal-red text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
