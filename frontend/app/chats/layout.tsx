'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMe } from '@/lib/auth';
import { useAppStore } from '@/lib/store';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setMe = useAppStore((s) => s.setMe);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((user) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setMe(user);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router, setMe]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-ultramarine border-t-transparent animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
