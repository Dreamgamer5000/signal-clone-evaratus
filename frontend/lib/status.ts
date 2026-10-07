import type { Message } from './types';

export type TickState = 'clock' | 'single' | 'double' | 'double-blue' | null;

export function tickState(message: Pick<Message, 'status' | 'sender_id'>, meId: number): TickState {
  if (message.sender_id != null && message.sender_id !== meId) return null;
  switch (message.status) {
    case 'sending':
      return 'clock';
    case 'sent':
      return 'single';
    case 'delivered':
      return 'double';
    case 'read':
      return 'double-blue';
    default:
      return null;
  }
}
