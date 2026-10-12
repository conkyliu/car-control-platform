import { useAuthStore } from '../../store/useAuthStore.ts';
import { loginApi } from '../../api/auth.ts';
import type { AuthResult, LoginInput } from '../../api/auth.ts';
import { ApiError } from '../../api/client.ts';

export const REMEMBER_USERNAME_STORAGE_KEY = 'car_control_remembered_username';

const getStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // fallback
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
};

/**
 * 获取本地缓存的已记住用户名
 */
export function getRememberedUsername(): string {
  const storage = getStorage();
  if (!storage) {
    return '';
  }
  return storage.getItem(REMEMBER_USERNAME_STORAGE_KEY) || '';
}

/**
 * 保存记住的用户名
 */
export function saveRememberedUsername(username: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.setItem(REMEMBER_USERNAME_STORAGE_KEY, username.trim());
}

/**
 * 清除已记住的用户名
 */
export function clearRememberedUsername(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(REMEMBER_USERNAME_STORAGE_KEY);
}

export interface LoginFormValues {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface ValidateLoginParams {
  username?: string;
  password?: string;
  captchaVerified: boolean;
}

/**
 * 校验登录表单与人机验证状态
 */
export function validateLoginForm(params: ValidateLoginParams): {
  valid: boolean;
  error?: string;
} {
  const trimmedUser = params.username?.trim();
  if (!trimmedUser) {
    return { valid: false, error: '请输入管理员工号 / 账号' };
  }
  if (!params.password) {
    return { valid: false, error: '请输入登录密码' };
  }
  if (!params.captchaVerified) {
    return { valid: false, error: '请先完成滑块人机验证' };
  }
  return { valid: true };
}

/**
 * 规范化登录错误信息映射（匹配设计规范 docs/design/page-specs/login.md 状态4）
 */
export function mapLoginErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return '账号或密码不正确，连续失败 5 次将锁定 15 分钟';
    }
    if (error.statusCode === 403) {
      return '该账号已被管理员停用，请联系企业管理员';
    }
    if (error.statusCode === 408 || error.statusCode === 504) {
      return '连接服务器超时，请检查网络设置';
    }
    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('econnrefused')
    ) {
      return '连接服务器超时，请检查网络设置';
    }
    return error.message;
  }

  return '登录失败，请检查网络后重试';
}

export interface ExecuteLoginOptions {
  input: {
    username: string;
    password: string;
    tenantId?: string;
  };
  captchaVerified: boolean;
  captchaToken: string | null;
  rememberMe: boolean;
  loginFn?: (input: LoginInput) => Promise<AuthResult>;
}

/**
 * 执行登录全流程：校验 -> API 调用 -> 双令牌与权限持久化 -> 记住账号维护
 */
export async function executeLogin(options: ExecuteLoginOptions): Promise<AuthResult> {
  const { input, captchaVerified, captchaToken, rememberMe, loginFn = loginApi } = options;

  const validation = validateLoginForm({
    username: input.username,
    password: input.password,
    captchaVerified,
  });

  if (!validation.valid) {
    throw new Error(validation.error || '登录表单未通过校验');
  }

  const trimmedUsername = input.username.trim();

  // 组装请求体（包含滑块 Ticket 与可选租户标识）
  const loginPayload: LoginInput = {
    username: trimmedUsername,
    password: input.password,
    captchaToken: captchaToken ?? undefined,
  };

  const authResult = await loginFn(loginPayload);

  // 存入 Zustand useAuthStore
  useAuthStore.getState().setAuth(
    {
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
    },
    authResult.user,
    authResult.user?.permissions
  );

  // 记住账号处理
  if (rememberMe) {
    saveRememberedUsername(trimmedUsername);
  } else {
    clearRememberedUsername();
  }

  return authResult;
}
