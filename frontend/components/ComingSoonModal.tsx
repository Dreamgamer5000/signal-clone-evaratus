'use client';

import { useState } from 'react';
import { Modal } from './Modal';

interface ComingSoonModalProps {
  title: string;
  description?: string;
  onClose: () => void;
}

export function ComingSoonModal({ title, description, onClose }: ComingSoonModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="py-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-04 mx-auto mb-4 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </div>
        <p className="text-gray-90 font-medium mb-1">Coming soon</p>
        <p className="text-sm text-gray-60">
          {description ?? `${title} is not available in this demo yet.`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 px-6 py-2.5 rounded-lg bg-ultramarine text-white text-sm font-medium hover:bg-ultramarine-dark"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}

export function useComingSoon() {
  const [state, setState] = useState<{ title: string; description?: string } | null>(null);
  const modal = state ? (
    <ComingSoonModal
      title={state.title}
      description={state.description}
      onClose={() => setState(null)}
    />
  ) : null;
  return {
    open: (title: string, description?: string) => setState({ title, description }),
    modal,
  };
}
