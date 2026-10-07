export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data.detail === 'string') detail = data.detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body ?? {});
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

import type {
  ConversationSummary,
  Member,
  Message,
  User,
} from './types';

export function getConversations(archived = false): Promise<ConversationSummary[]> {
  return apiGet(`/api/conversations?archived=${archived}`);
}

export function getConversation(id: number): Promise<ConversationSummary & { members: Member[] }> {
  return apiGet(`/api/conversations/${id}`);
}

export function createDirect(userId: number): Promise<{ conversation_id: number }> {
  return apiPost('/api/conversations/direct', { user_id: userId });
}

export function createGroup(title: string, userIds: number[]): Promise<{ conversation_id: number }> {
  return apiPost('/api/conversations/group', { title, user_ids: userIds });
}

export function patchConversation(
  id: number,
  patch: {
    title?: string;
    is_pinned?: boolean;
    is_archived?: boolean;
    is_muted?: boolean;
  },
): Promise<{ conversation_id: number }> {
  return apiPatch(`/api/conversations/${id}`, patch);
}

export function getMessages(
  id: number,
  opts: { beforeId?: number; limit?: number } = {},
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (opts.beforeId != null) params.set('before_id', String(opts.beforeId));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiGet(`/api/conversations/${id}/messages${qs ? `?${qs}` : ''}`);
}

export function sendMessage(
  id: number,
  clientId: string,
  body: string,
): Promise<Message> {
  return apiPost(`/api/conversations/${id}/messages`, {
    client_id: clientId,
    body,
  });
}

export function sendReceipts(
  id: number,
  messageIds: number[],
  status: 'delivered' | 'read',
): Promise<void> {
  return apiPost(`/api/conversations/${id}/receipts`, {
    message_ids: messageIds,
    status,
  });
}

export function sendTyping(id: number, active: boolean): Promise<void> {
  return apiPost(`/api/conversations/${id}/typing`, { active });
}

export function getMembers(id: number): Promise<Member[]> {
  return apiGet(`/api/conversations/${id}/members`);
}

export function searchUsers(q: string): Promise<User[]> {
  return apiGet(`/api/users?q=${encodeURIComponent(q)}`);
}

export function getContacts(): Promise<
  {
    contact_id: number;
    owner_id: number;
    contact_user_id: number;
    nickname: string | null;
    created_at: number;
    user: User;
  }[]
> {
  return apiGet('/api/contacts');
}

export function addContact(phoneOrUsername: string, nickname?: string): Promise<unknown> {
  return apiPost('/api/contacts', {
    phone_or_username: phoneOrUsername,
    nickname,
  });
}

export function deleteContact(contactId: number): Promise<void> {
  return apiDelete(`/api/contacts/${contactId}`);
}

export function getSettings(): Promise<Record<string, string>> {
  return apiGet('/api/settings');
}

export function patchSettings(patch: Record<string, string>): Promise<Record<string, string>> {
  return apiPatch('/api/settings', patch);
}

export function patchMe(patch: {
  display_name?: string;
  about?: string;
  avatar_color?: string;
}): Promise<{ user: User }> {
  return apiPatch('/api/users/me', patch);
}
