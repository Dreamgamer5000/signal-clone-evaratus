import { apiGet, apiPost, ApiError } from './api';
import type { User } from './types';

export async function fetchMe(): Promise<User | null> {
  try {
    const res = await apiGet<{ user: User }>('/api/auth/me');
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function startOtp(phoneNumber: string): Promise<{ otp_sent: boolean }> {
  return apiPost('/api/auth/otp/start', { phone_number: phoneNumber });
}

export function verifyOtp(
  phoneNumber: string,
  code: string,
): Promise<{ user: User }> {
  return apiPost('/api/auth/otp/verify', {
    phone_number: phoneNumber,
    code,
  });
}

export interface RegisterPayload {
  phone_number: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

export function register(payload: RegisterPayload): Promise<{ user: User }> {
  return apiPost('/api/auth/register', payload);
}

export async function logout(): Promise<void> {
  await apiPost('/api/auth/logout');
}
