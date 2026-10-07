import type {
  SseConversationUpdated,
  SseMessageNew,
  SseMessageStatus,
  SsePresenceUpdate,
  SseTypingUpdate,
} from './types';

export interface SseHandlers {
  onMessageNew: (payload: SseMessageNew['payload']) => void;
  onMessageStatus: (payload: SseMessageStatus['payload']) => void;
  onTyping: (payload: SseTypingUpdate['payload']) => void;
  onPresence: (payload: SsePresenceUpdate['payload']) => void;
  onConversationUpdated: (payload: SseConversationUpdated['payload']) => void;
  onOpen: () => void;
}

interface SseClientOptions {
  initialRetryMs?: number;
  maxRetryMs?: number;
}

export function connectSSE(handlers: SseHandlers, options: SseClientOptions = {}): () => void {
  const initialRetryMs = options.initialRetryMs ?? 1000;
  const maxRetryMs = options.maxRetryMs ?? 10_000;
  let retryMs = initialRetryMs;
  let stopped = false;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstRetry = true;

  function connect() {
    if (stopped) return;
    source = new EventSource('/api/events');

    source.onopen = () => {
      retryMs = initialRetryMs;
      firstRetry = true;
      handlers.onOpen();
    };

    source.addEventListener('message.new', (e) => {
      handlers.onMessageNew(JSON.parse((e as MessageEvent).data).payload);
    });
    source.addEventListener('message.status', (e) => {
      handlers.onMessageStatus(JSON.parse((e as MessageEvent).data).payload);
    });
    source.addEventListener('typing.update', (e) => {
      handlers.onTyping(JSON.parse((e as MessageEvent).data).payload);
    });
    source.addEventListener('presence.update', (e) => {
      handlers.onPresence(JSON.parse((e as MessageEvent).data).payload);
    });
    source.addEventListener('conversation.updated', (e) => {
      handlers.onConversationUpdated(JSON.parse((e as MessageEvent).data).payload);
    });

    source.onerror = () => {
      source?.close();
      source = null;
      if (stopped) return;
      if (timer) clearTimeout(timer);
      // First retry is immediate (as native EventSource does); then back off.
      const delay = firstRetry ? 0 : retryMs;
      if (!firstRetry) retryMs = Math.min(retryMs * 2, maxRetryMs);
      firstRetry = false;
      timer = setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    source?.close();
    source = null;
  };
}
