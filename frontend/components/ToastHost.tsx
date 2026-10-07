'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismissToast(t.id), 4000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <div className="fixed bottom-4 left-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className="bg-toast-bg text-toast-fg text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-xs text-left hover:opacity-90"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
