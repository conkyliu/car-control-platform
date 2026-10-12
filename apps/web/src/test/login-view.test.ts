import test from 'node:test';
import assert from 'node:assert/strict';

// Setup mock localStorage before importing stores
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => { mockStorage.set(key, String(val)); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() { return mockStorage.size; },
};

(globalThis as any).localStorage = storageMock;
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import { useAuthStore } from '../store/useAuthStore.ts';
import { ApiError } from '../api/client.ts';
import {
  getRememberedUsername,
  saveRememberedUsername,
  clearRememberedUsername,
  mapLoginErrorToMessage,
  executeLogin,
  validateLoginForm,
  REMEMBER_USERNAME_STORAGE_KEY,
} from '../views/auth/login-view-core.ts';

test('LoginView Page Core Logic Test Suite', async (t) => {
  // Test 1: Remember Me Username Persistence
  await t.test('Remember Me saves, retrieves, and clears username from storage', () => {
    storageMock.clear();
    assert.equal(getRememberedUsername(), '');

    saveRememberedUsername('admin_user');
    assert.equal(getRememberedUsername(), 'admin_user');
    assert.equal(storageMock.getItem(REMEMBER_USERNAME_STORAGE_KEY), 'admin_user');

    clearRememberedUsername();
    assert.equal(getRememberedUsername(), '');
    assert.equal(storageMock.getItem(REMEMBER_USERNAME_STORAGE_KEY), null);
  });

  // Test 2: Form validation logic
  await t.test('validateLoginForm checks username, password, and captcha requirements', () => {
    // Missing username
    const res1 = validateLoginForm({ username: '', password: 'Password123!', captchaVerified: true });
    assert.equal(res1.valid, false);
    assert.ok(res1.error?.includes('账号'));

    // Missing password
    const res2 = validateLoginForm({ username: 'admin', password: '', captchaVerified: true });
    assert.equal(res2.valid, false);
    assert.ok(res2.error?.includes('密码'));

    // Missing captcha verification
    const res3 = validateLoginForm({ username: 'admin', password: 'Password123!', captchaVerified: false });
    assert.equal(res3.valid, false);
    assert.equal(res3.error, '请先完成滑块人机验证');

    // All valid
    const res4 = validateLoginForm({ username: 'admin', password: 'Password123!', captchaVerified: true });
    assert.equal(res4.valid, true);
    assert.equal(res4.error, undefined);
  });

  // Test 3: Natural language friendly error mapping matching page spec (Section 4)
  await t.test('mapLoginErrorToMessage returns spec-compliant natural language messages', () => {
    // 401 Unauthorized / wrong password
    const err401 = new ApiError('Unauthorized', 401);
    assert.equal(
      mapLoginErrorToMessage(err401),
      '账号或密码不正确，连续失败 5 次将锁定 15 分钟'
    );

    // 403 Forbidden / account disabled
    const err403 = new ApiError('Account disabled by admin', 403);
    assert.equal(
      mapLoginErrorToMessage(err403),
      '该账号已被管理员停用，请联系企业管理员'
    );

    // Network timeout / connection error
    const errTimeout = new Error('Failed to fetch: timeout');
    assert.equal(
      mapLoginErrorToMessage(errTimeout),
      '连接服务器超时，请检查网络设置'
    );

    // Fallback message
    const errGeneral = new Error('Custom validation error');
    assert.equal(
      mapLoginErrorToMessage(errGeneral),
      'Custom validation error'
    );
  });

  // Test 4: executeLogin prevents submission if captcha is not verified
  await t.test('executeLogin blocks API call when captcha is not verified', async () => {
    let apiCalled = false;
    const mockLoginApi = async () => {
      apiCalled = true;
      return null as any;
    };

    await assert.rejects(
      async () => {
        await executeLogin({
          input: { username: 'admin', password: 'password123' },
          captchaVerified: false,
          captchaToken: null,
          rememberMe: true,
          loginFn: mockLoginApi,
        });
      },
      (err: any) => {
        assert.equal(err.message, '请先完成滑块人机验证');
        return true;
      }
    );

    assert.equal(apiCalled, false);
  });

  // Test 5: executeLogin succeeds, updates auth store, and saves remembered username
  await t.test('executeLogin succeeds, stores tokens and user in useAuthStore, persists username', async () => {
    useAuthStore.getState().clearAuth();
    storageMock.clear();

    const mockAuthResult = {
      accessToken: 'acc_token_123',
      refreshToken: 'ref_token_456',
      expiresIn: 900,
      user: {
        id: 'usr_001',
        tenantId: 'tnt_default',
        username: 'super_admin',
        roles: ['SUPER_ADMIN'],
        permissions: ['*:*'],
      },
    };

    let loginFnArgs: any = null;
    const mockLoginApi = async (args: any) => {
      loginFnArgs = args;
      return mockAuthResult;
    };

    const result = await executeLogin({
      input: { username: 'super_admin', password: 'ValidPassword123!' },
      captchaVerified: true,
      captchaToken: 'mock_captcha_token_abc',
      rememberMe: true,
      loginFn: mockLoginApi,
    });

    assert.deepEqual(result, mockAuthResult);
    assert.deepEqual(loginFnArgs, {
      username: 'super_admin',
      password: 'ValidPassword123!',
      captchaToken: 'mock_captcha_token_abc',
    });

    // Verify useAuthStore updated
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useAuthStore.getState().accessToken, 'acc_token_123');
    assert.equal(useAuthStore.getState().refreshToken, 'ref_token_456');
    assert.equal(useAuthStore.getState().user?.username, 'super_admin');

    // Verify remembered username was saved
    assert.equal(getRememberedUsername(), 'super_admin');

    // Test with rememberMe: false -> should clear stored username
    await executeLogin({
      input: { username: 'super_admin', password: 'ValidPassword123!' },
      captchaVerified: true,
      captchaToken: 'mock_captcha_token_abc',
      rememberMe: false,
      loginFn: mockLoginApi,
    });
    assert.equal(getRememberedUsername(), '');
  });
});
