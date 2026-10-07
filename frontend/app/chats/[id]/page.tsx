'use client';

import { use } from 'react';
import { ChatPane } from '@/components/ChatPane';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const conversationId = Number(id);
  if (!Number.isFinite(conversationId)) {
    return <div className="flex-1 flex items-center justify-center text-gray-60">Not found</div>;
  }
  return <ChatPane conversationId={conversationId} />;
}
