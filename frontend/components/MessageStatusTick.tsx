'use client';

import type { TickState } from '@/lib/status';

export function MessageStatusTick({ state }: { state: TickState }) {
  if (!state) return null;
  const stroke = state === 'double-blue' ? '#c9dcff' : 'rgba(255,255,255,0.7)';
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0"
      aria-label={state}
    >
      {state === 'clock' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </>
      ) : state === 'single' ? (
        <path d="M4 12.5 9 17.5 20 6.5" />
      ) : (
        <>
          <path d="M2 12.5 7 17.5 18 6.5" />
          <path d="M10 12.5 15 17.5 26 6.5" transform="translate(-6 0)" />
        </>
      )}
    </svg>
  );
}
