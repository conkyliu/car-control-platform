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
import { useTenantStore } from '../store/useTenantStore.ts';
import type { TenantDto } from '../store/useTenantStore.ts';
import { useNavTabsStore } from '../store/useNavTabsStore.ts';
import {
  routes,
  RoutePath,
  filterAccessibleRoutes,
  getAccessibleRoutesByCategory,
  computeBreadcrumbs,
} from '../router/routes.ts';
import {
  formatTenantQuota,
  switchTenant,
  executeLogout,
  resolveAuthRoute,
  checkPermission,
} from '../layouts/admin-layout-core.ts';

test('AdminLayout and Navigation Hub Core Test Suite', async (t) => {
  t.beforeEach(() => {
    storageMock.clear();
    useAuthStore.getState().clearAuth();
    useTenantStore.getState().clearTenant();
    useNavTabsStore.getState().resetTabs();
  });

  // Test 1: RBAC Dynamic Menu Filtering
  await t.test('filterAccessibleRoutes filters out hidden routes and unauthorized routes', () => {
    // 1. Super Admin with wildcard '*:*'
    useAuthStore.getState().setAuth(
      { accessToken: 'token', refreshToken: 'ref' },
      { id: 'u1', tenantId: 't1', username: 'admin', roles: ['SUPER_ADMIN'], permissions: ['*:*'] }
    );
    const hasPermSuper = useAuthStore.getState().hasPermission;
    const superRoutes = filterAccessibleRoutes(hasPermSuper);
    assert.equal(superRoutes.length, 14, 'All 14 business routes should be visible for Super Admin');
    assert.equal(superRoutes.some((r) => r.path === RoutePath.LOGIN), false, 'LOGIN route should remain hidden in menu');

    // 2. Normal Operator with restricted permissions: only device:read and telemetry:read
    useAuthStore.getState().setAuth(
      { accessToken: 'token', refreshToken: 'ref' },
      {
        id: 'u2',
        tenantId: 't1',
        username: 'operator',
        roles: ['OPERATOR'],
        permissions: ['device:read', 'telemetry:read'],
      }
    );
    const hasPermOp = useAuthStore.getState().hasPermission;
    const opRoutes = filterAccessibleRoutes(hasPermOp);
    assert.equal(opRoutes.length, 2);
    assert.deepEqual(
      opRoutes.map((r) => r.path).sort(),
      [RoutePath.DEVICES, RoutePath.TELEMETRY].sort()
    );

    // 3. Module Wildcard permission e.g. vehicle:* should access both /vehicles and /commands
    useAuthStore.getState().setAuth(
      { accessToken: 'token', refreshToken: 'ref' },
      {
        id: 'u3',
        tenantId: 't1',
        username: 'fleet_mgr',
        roles: ['FLEET_MANAGER'],
        permissions: ['vehicle:*'],
      }
    );
    const hasPermFleet = useAuthStore.getState().hasPermission;
    const fleetRoutes = filterAccessibleRoutes(hasPermFleet);
    assert.equal(fleetRoutes.length, 2);
    assert.deepEqual(
      fleetRoutes.map((r) => r.path).sort(),
      [RoutePath.VEHICLES, RoutePath.COMMANDS].sort()
    );
  });

  // Test 2: Category grouping prune empty categories
  await t.test('getAccessibleRoutesByCategory groups accessible routes and omits empty categories', () => {
    useAuthStore.getState().setAuth(
      { accessToken: 'token', refreshToken: 'ref' },
      {
        id: 'u4',
        tenantId: 't1',
        username: 'device_user',
        roles: ['USER'],
        permissions: ['device:read'],
      }
    );
    const hasPerm = useAuthStore.getState().hasPermission;
    const grouped = getAccessibleRoutesByCategory(hasPerm);

    assert.ok(grouped['资产管理'], '资产管理 should be present');
    assert.equal(grouped['资产管理']?.length, 1);
    assert.equal(grouped['资产管理']?.[0]?.path, RoutePath.DEVICES);

    // Categories with no allowed permissions must NOT appear
    assert.equal(grouped['概览看板'], undefined);
    assert.equal(grouped['平台中枢'], undefined);
    assert.equal(grouped['车控运营'], undefined);
    assert.equal(grouped['位置与围栏'], undefined);
    assert.equal(grouped['运维保障'], undefined);
  });

  // Test 3: Tenant switching and Quota calculation
  await t.test('TenantSelector updates active tenant and formats quota correctly', () => {
    const mockTenants: TenantDto[] = [
      { id: 't_alpha', name: '车队租户 Alpha', code: 'ALPHA', status: 'ACTIVE', quotaDeviceCount: 1000 },
      { id: 't_beta', name: '租赁租户 Beta', code: 'BETA', status: 'ACTIVE', quotaDeviceCount: 500 },
    ];
    useTenantStore.getState().setTenantList(mockTenants);
    useTenantStore.getState().setCurrentTenantId('t_alpha');

    assert.equal(useTenantStore.getState().currentTenantId, 't_alpha');

    // Switch tenant
    switchTenant('t_beta');
    assert.equal(useTenantStore.getState().currentTenantId, 't_beta');

    // Quota display formatting
    const quotaText1 = formatTenantQuota(mockTenants[0]!, {
      tenantId: 't_alpha',
      totalQuota: 1000,
      usedCount: 850,
      remainingQuota: 150,
      usagePercentage: 85,
    });
    assert.equal(quotaText1, '配额: 850/1000 台 (85%)');

    // Fallback when only quotaDeviceCount is available
    const quotaText2 = formatTenantQuota(mockTenants[1]!);
    assert.equal(quotaText2, '配额上限: 500 台');
  });

  // Test 4: NavTabs lifecycle (open, switch, close, closeOthers, closeAll, refresh)
  await t.test('NavTabs handles multi-tabs lifecycle and boundary conditions', () => {
    const nav = useNavTabsStore.getState();

    // Default tab is Dashboard, non-closable
    assert.equal(nav.tabs.length, 1);
    assert.equal(nav.tabs[0]?.key, RoutePath.DASHBOARD);
    assert.equal(nav.tabs[0]?.closable, false);
    assert.equal(nav.activeKey, RoutePath.DASHBOARD);

    // 1. Open new tabs
    nav.openTab({ key: RoutePath.DEVICES, title: '设备管理' });
    nav.openTab({ key: RoutePath.COMMANDS, title: '车控中心' });

    assert.equal(useNavTabsStore.getState().tabs.length, 3);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.COMMANDS);

    // 2. Open already existing tab should activate it without duplicate
    nav.openTab({ key: RoutePath.DEVICES, title: '设备管理' });
    assert.equal(useNavTabsStore.getState().tabs.length, 3);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.DEVICES);

    // 3. Switch tab
    nav.switchTab(RoutePath.COMMANDS);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.COMMANDS);

    // 4. Close active tab: should switch activeKey to previous tab
    nav.closeTab(RoutePath.COMMANDS);
    assert.equal(useNavTabsStore.getState().tabs.length, 2);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.DEVICES);

    // 5. Cannot close unclosable tab
    nav.closeTab(RoutePath.DASHBOARD);
    assert.equal(useNavTabsStore.getState().tabs.length, 2, 'Unclosable tab should not be removed');

    // 6. Close others: leaves Dashboard and active tab
    nav.openTab({ key: RoutePath.VEHICLES, title: '车辆管理' });
    nav.openTab({ key: RoutePath.TELEMETRY, title: '实时定位' });
    assert.equal(useNavTabsStore.getState().tabs.length, 4);

    nav.closeOthers(RoutePath.VEHICLES);
    const remainingTabs = useNavTabsStore.getState().tabs;
    assert.equal(remainingTabs.length, 2);
    assert.deepEqual(
      remainingTabs.map((t) => t.key),
      [RoutePath.DASHBOARD, RoutePath.VEHICLES]
    );
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.VEHICLES);

    // 7. Refresh tab
    const initialRefresh = useNavTabsStore.getState().refreshCount[RoutePath.VEHICLES] ?? 0;
    nav.refreshTab(RoutePath.VEHICLES);
    assert.equal(useNavTabsStore.getState().refreshCount[RoutePath.VEHICLES], initialRefresh + 1);

    // 8. Close all: closes all closable tabs, resets to Dashboard
    nav.closeAll();
    assert.equal(useNavTabsStore.getState().tabs.length, 1);
    assert.equal(useNavTabsStore.getState().tabs[0]?.key, RoutePath.DASHBOARD);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.DASHBOARD);
  });

  // Test 5: Breadcrumb computation
  await t.test('computeBreadcrumbs generates hierarchical breadcrumbs for given path', () => {
    // Route in category: /devices
    const crumbs = computeBreadcrumbs(RoutePath.DEVICES);
    assert.deepEqual(crumbs, [
      { title: '首页', path: RoutePath.DASHBOARD },
      { title: '资产管理' },
      { title: '设备管理', path: RoutePath.DEVICES },
    ]);

    // Dashboard path
    const dashCrumbs = computeBreadcrumbs(RoutePath.DASHBOARD);
    assert.deepEqual(dashCrumbs, [
      { title: '首页', path: RoutePath.DASHBOARD },
      { title: '运营看板', path: RoutePath.DASHBOARD },
    ]);

    // Unknown path fallback
    const fallbackCrumbs = computeBreadcrumbs('/unknown');
    assert.deepEqual(fallbackCrumbs, [
      { title: '首页', path: RoutePath.DASHBOARD },
      { title: '未知页面' },
    ]);
  });

  // Test 6: AuthGuard & PermissionGuard core logic
  await t.test('AuthGuard and PermissionGuard evaluate access state accurately', () => {
    // Unauthenticated
    assert.equal(resolveAuthRoute(false), 'LOGIN');
    // Authenticated
    assert.equal(resolveAuthRoute(true), 'ADMIN');

    // PermissionGuard helper
    const hasPermFn = (code: string) => code === 'device:read';
    assert.equal(checkPermission(hasPermFn, 'device:read'), true);
    assert.equal(checkPermission(hasPermFn, 'device:write'), false);
    assert.equal(checkPermission(undefined, 'device:read'), false);
  });

  // Test 7: Logout clears all authentication, tenant, and navtabs state
  await t.test('executeLogout purges auth tokens, tenant state, and resets nav tabs', async () => {
    // Seed stores
    useAuthStore.getState().setAuth(
      { accessToken: 'token_xyz', refreshToken: 'ref_xyz' },
      { id: 'u_test', tenantId: 't_test', username: 'test_admin', roles: ['SUPER_ADMIN'], permissions: ['*'] }
    );
    useTenantStore.getState().setCurrentTenantId('t_test');
    useNavTabsStore.getState().openTab({ key: RoutePath.DEVICES, title: '设备管理' });

    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useTenantStore.getState().currentTenantId, 't_test');
    assert.equal(useNavTabsStore.getState().tabs.length, 2);

    let logoutApiCalled = false;
    const mockLogoutApi = async () => {
      logoutApiCalled = true;
    };

    await executeLogout(mockLogoutApi);

    assert.equal(logoutApiCalled, true);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().accessToken, null);
    assert.equal(useAuthStore.getState().user, null);
    assert.equal(useTenantStore.getState().currentTenantId, null);
    assert.equal(useNavTabsStore.getState().tabs.length, 1);
    assert.equal(useNavTabsStore.getState().activeKey, RoutePath.DASHBOARD);
  });
});
