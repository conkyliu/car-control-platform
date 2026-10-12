import { http } from './client.ts';
import type { UserInfo } from '../store/useAuthStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';

export interface LoginInput {
  username: string;
  password: string;
  captchaToken?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: UserInfo;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user?: UserInfo;
}

export type UserProfile = UserInfo;

/**
 * 登录认证 API
 */
export async function loginApi(input: LoginInput): Promise<AuthResult> {
  const result = await http.post<AuthResult>('/auth/login', input, { skipAuth: true });
  return result;
}

/**
 * 刷新访问令牌 API
 */
export async function refreshApi(refreshToken: string): Promise<RefreshResult> {
  const result = await http.post<RefreshResult>(
    '/auth/refresh',
    { refreshToken },
    { skipAuth: true }
  );
  return result;
}

/**
 * 获取当前登录用户信息 API
 */
export async function profileApi(): Promise<UserProfile> {
  const result = await http.get<UserProfile>('/auth/me');
  return result;
}

/**
 * 退出登录 API
 */
export async function logoutApi(): Promise<void> {
  try {
    await http.post<void>('/auth/logout');
  } catch {
    // 允许后端无端点或网络故障降级，确保本地状态安全清空
  } finally {
    useAuthStore.getState().clearAuth();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'user_action' } }));
    }
  }
}
