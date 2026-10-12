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

// Now import target modules
import { HttpClient, ApiError, http } from '../api/client.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useTenantStore } from '../store/useTenantStore.ts';
import { routes, RoutePath, RouteCategory, findRouteByPath, getMenuRoutes } from '../router/routes.ts';
import { loginApi, refreshApi, profileApi, logoutApi } from '../api/auth.ts';
import { getTenantsApi, getTenantQuotaApi, updateTenantStatusApi, getOrgTreeApi, createOrgApi } from '../api/tenant.ts';

test('API Client, Stores, and Route Definitions Test Suite', async (t) => {
  // Test 1: useAuthStore State and Permission Checking
  await t.test('useAuthStore sets credentials, detects permissions and wildcards, clears auth', () => {
    useAuthStore.getState().clearAuth();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().accessToken, null);
    assert.equal(useAuthStore.getState().refreshToken, null);
    assert.equal(useAuthStore.getState().user, null);

    // Set auth
    useAuthStore.getState().setAuth(
      { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
      { id: 'u1', username: 'admin', tenantId: 'tnt_1', roles: ['ADMIN'], permissions: ['vehicle:read', 'device:*'] },
      ['vehicle:read', 'device:*']
    );

    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useAuthStore.getState().accessToken, 'mock-access-token');
    assert.equal(useAuthStore.getState().refreshToken, 'mock-refresh-token');
    assert.equal(useAuthStore.getState().hasPermission('vehicle:read'), true);
    assert.equal(useAuthStore.getState().hasPermission('device:write'), true); // wildcard match
    assert.equal(useAuthStore.getState().hasPermission('user:manage'), false);

    // Clear auth
    useAuthStore.getState().clearAuth();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().accessToken, null);
    assert.equal(useAuthStore.getState().hasPermission('vehicle:read'), false);
  });

  // Test 2: useTenantStore State and Tenant Switching
  await t.test('useTenantStore manages active tenant, org tree, and tenant list', () => {
    useTenantStore.getState().setCurrentTenantId('tnt_demo');
    useTenantStore.getState().setCurrentOrgId('org_1');
    assert.equal(useTenantStore.getState().currentTenantId, 'tnt_demo');
    assert.equal(useTenantStore.getState().currentOrgId, 'org_1');

    useTenantStore.getState().setTenantList([
      { id: 'tnt_demo', name: 'Demonstration Fleet', code: 'DEMO', status: 'ACTIVE', quotaDeviceCount: 100 },
    ]);
    assert.equal(useTenantStore.getState().tenantList.length, 1);
    assert.equal(useTenantStore.getState().tenantList[0].name, 'Demonstration Fleet');

    useTenantStore.getState().setOrgTree([
      { id: 'org_1', tenantId: 'tnt_demo', name: 'HQ', code: 'HQ', children: [] },
    ]);
    assert.equal(useTenantStore.getState().orgTree.length, 1);
    assert.equal(useTenantStore.getState().orgTree[0].name, 'HQ');
  });

  // Test 3: HTTP Client Request Interceptor (Bearer token & x-tenant-id)
  await t.test('HttpClient injects Authorization and x-tenant-id headers automatically', async () => {
    useAuthStore.getState().setAuth(
      { accessToken: 'test-jwt-token', refreshToken: 'test-refresh-token' },
      { id: 'u1', username: 'tester', tenantId: 'tnt_xyz', roles: [], permissions: [] }
    );
    useTenantStore.getState().setCurrentTenantId('tnt_xyz');

    let interceptedUrl = '';
    let interceptedHeaders: Headers | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      interceptedUrl = input.toString();
      interceptedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ success: true, data: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new HttpClient('/api/v1', mockFetch);
    const result = await client.get<{ success: boolean; data: string }>('/vehicles', { page: 1, limit: 10 });

    assert.equal(result.data, 'ok');
    assert.ok(interceptedUrl.includes('/api/v1/vehicles?page=1&limit=10'));
    assert.equal(interceptedHeaders?.get('Authorization'), 'Bearer test-jwt-token');
    assert.equal(interceptedHeaders?.get('x-tenant-id'), 'tnt_xyz');
    assert.equal(interceptedHeaders?.get('Content-Type'), 'application/json');
  });

  // Test 4: HTTP Client 401 Silent Token Refresh & Re-request
  await t.test('HttpClient intercepts 401, calls refresh, updates store, and retries original request', async () => {
    useAuthStore.getState().setAuth(
      { accessToken: 'expired-token', refreshToken: 'valid-refresh-token' },
      { id: 'u1', username: 'tester', tenantId: 'tnt_1', roles: [], permissions: [] }
    );

    let refreshCallCount = 0;
    let requestCount = 0;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      const headers = new Headers(init?.headers);

      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        const body = JSON.parse(init?.body as string);
        assert.equal(body.refreshToken, 'valid-refresh-token');
        return new Response(
          JSON.stringify({
            accessToken: 'brand-new-token',
            refreshToken: 'renewed-refresh-token',
            expiresIn: 900,
            user: { id: 'u1', username: 'tester', tenantId: 'tnt_1', roles: [], permissions: [] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/protected-resource')) {
        requestCount++;
        const auth = headers.get('Authorization');
        if (auth === 'Bearer expired-token') {
          return new Response(
            JSON.stringify({ statusCode: 401, message: 'Token expired', error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (auth === 'Bearer brand-new-token') {
          return new Response(
            JSON.stringify({ message: 'Success with refreshed token' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response('Not Found', { status: 404 });
    };

    const client = new HttpClient('/api/v1', mockFetch);
    const res = await client.get<{ message: string }>('/protected-resource');

    assert.equal(res.message, 'Success with refreshed token');
    assert.equal(refreshCallCount, 1);
    assert.equal(requestCount, 2); // Initial 401 request + retried 200 request
    assert.equal(useAuthStore.getState().accessToken, 'brand-new-token');
    assert.equal(useAuthStore.getState().refreshToken, 'renewed-refresh-token');
  });

  // Test 5: HTTP Client 401 Silent Token Refresh Queues Concurrent Requests
  await t.test('HttpClient queues concurrent 401 requests to trigger only ONE token refresh', async () => {
    useAuthStore.getState().setAuth(
      { accessToken: 'expired-token', refreshToken: 'valid-refresh-token' },
      { id: 'u1', username: 'tester', tenantId: 'tnt_1', roles: [], permissions: [] }
    );

    let refreshCallCount = 0;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      const headers = new Headers(init?.headers);

      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        // Simulate network delay for refresh
        await new Promise((r) => setTimeout(r, 50));
        return new Response(
          JSON.stringify({
            accessToken: 'shared-new-token',
            refreshToken: 'shared-renewed-refresh',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const auth = headers.get('Authorization');
      if (auth === 'Bearer expired-token') {
        return new Response(
          JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (auth === 'Bearer shared-new-token') {
        return new Response(
          JSON.stringify({ url, status: 'ok' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Bad Request', { status: 400 });
    };

    const client = new HttpClient('/api/v1', mockFetch);

    // Launch 3 requests concurrently with expired token
    const [res1, res2, res3] = await Promise.all([
      client.get<{ url: string; status: string }>('/item/1'),
      client.get<{ url: string; status: string }>('/item/2'),
      client.get<{ url: string; status: string }>('/item/3'),
    ]);

    assert.equal(res1.status, 'ok');
    assert.equal(res2.status, 'ok');
    assert.equal(res3.status, 'ok');
    assert.equal(refreshCallCount, 1, 'Only one refresh call should be made despite 3 concurrent 401s');
  });

  // Test 6: HTTP Client 401 Refresh Failure Clears Auth and Throws ApiError
  await t.test('HttpClient clears useAuthStore and throws ApiError when refresh token itself fails', async () => {
    useAuthStore.getState().setAuth(
      { accessToken: 'bad-token', refreshToken: 'invalid-refresh-token' },
      { id: 'u1', username: 'tester', tenantId: 'tnt_1', roles: [], permissions: [] }
    );

    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ statusCode: 401, message: 'Invalid refresh token', error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ statusCode: 401, message: 'Access token expired', error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new HttpClient('/api/v1', mockFetch);

    await assert.rejects(
      async () => {
        await client.get('/some-data');
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // Store should have been cleared
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().accessToken, null);
    assert.equal(useAuthStore.getState().refreshToken, null);
  });

  // Test 7: HTTP Client Structured ApiError Parsing
  await t.test('HttpClient correctly parses 4xx and 5xx errors into structured ApiError', async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          statusCode: 409,
          message: 'VEHICLE_COMMAND_IN_PROGRESS',
          error: 'Conflict',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new HttpClient('/api/v1', mockFetch);

    await assert.rejects(
      async () => {
        await client.post('/commands', { code: 'CMD_LOCK' });
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
        assert.equal(err.message, 'VEHICLE_COMMAND_IN_PROGRESS');
        assert.equal(err.error, 'Conflict');
        return true;
      }
    );
  });

  // Test 8: Routes Definitions (15 business routes)
  await t.test('Route definitions include all 15 business paths with title, icon, and permissions', () => {
    assert.equal(routes.length, 15);

    const expectedPaths = [
      RoutePath.LOGIN,
      RoutePath.DASHBOARD,
      RoutePath.TENANTS,
      RoutePath.ORGS,
      RoutePath.USERS,
      RoutePath.ROLES,
      RoutePath.DEVICES,
      RoutePath.VEHICLES,
      RoutePath.COMMANDS,
      RoutePath.TELEMETRY,
      RoutePath.GEOFENCE,
      RoutePath.ALARMS,
      RoutePath.OTA,
      RoutePath.LOGS,
      RoutePath.MONITOR,
    ];

    expectedPaths.forEach((path) => {
      const match = findRouteByPath(path);
      assert.ok(match, `Route ${path} must exist`);
      assert.ok(match.title, `Route ${path} must have a title`);
      if (path !== RoutePath.LOGIN) {
        assert.ok(match.icon, `Route ${path} must have an icon`);
        assert.ok(match.category, `Route ${path} must have a category`);
      }
    });

    const menuRoutes = getMenuRoutes();
    assert.equal(menuRoutes.length, 14, 'All routes except /login should appear in menu');
    assert.equal(menuRoutes.find((r) => r.path === RoutePath.LOGIN), undefined);
  });

  // Test 9: Auth and Tenant API Definitions
  await t.test('auth and tenant API wrapper functions are exported and callable', () => {
    assert.equal(typeof loginApi, 'function');
    assert.equal(typeof refreshApi, 'function');
    assert.equal(typeof profileApi, 'function');
    assert.equal(typeof logoutApi, 'function');
    assert.equal(typeof getTenantsApi, 'function');
    assert.equal(typeof getTenantQuotaApi, 'function');
    assert.equal(typeof updateTenantStatusApi, 'function');
    assert.equal(typeof getOrgTreeApi, 'function');
    assert.equal(typeof createOrgApi, 'function');
  });
});
