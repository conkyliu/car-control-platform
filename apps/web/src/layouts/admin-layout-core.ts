import { useAuthStore } from '../store/useAuthStore.ts';
import { useTenantStore } from '../store/useTenantStore.ts';
import type { TenantDto, TenantQuotaDto } from '../store/useTenantStore.ts';
import { useNavTabsStore } from '../store/useNavTabsStore.ts';

/**
 * 格式化租户配额信息
 */
export function formatTenantQuota(tenant: TenantDto, quota?: TenantQuotaDto): string {
  if (quota) {
    return `配额: ${quota.usedCount}/${quota.totalQuota} 台 (${quota.usagePercentage}%)`;
  }
  return `配额上限: ${tenant.quotaDeviceCount} 台`;
}

/**
 * 切换全局租户
 */
export function switchTenant(tenantId: string): void {
  useTenantStore.getState().setCurrentTenantId(tenantId);
  const activeKey = useNavTabsStore.getState().activeKey;
  if (activeKey) {
    useNavTabsStore.getState().refreshTab(activeKey);
  }
}

/**
 * 执行退出登录操作：调用退出接口、清理身份认证与租户状态、重置多标签页
 */
export async function executeLogout(logoutApiFn?: () => Promise<void>): Promise<void> {
  if (logoutApiFn) {
    try {
      await logoutApiFn();
    } catch {
      // 容错处理：即使服务端退出接口失败，本地状态也必须强制清空保障安全性
    }
  }

  useAuthStore.getState().clearAuth();
  useTenantStore.getState().clearTenant();
  useNavTabsStore.getState().resetTabs();
}

/**
 * 根据认证状态判定当前渲染根视图
 */
export function resolveAuthRoute(isAuthenticated: boolean): 'LOGIN' | 'ADMIN' {
  return isAuthenticated ? 'ADMIN' : 'LOGIN';
}

/**
 * 校验指定权限代码是否具备访问权限
 */
export function checkPermission(
  hasPermFn: ((code: string) => boolean) | undefined,
  code: string
): boolean {
  if (!hasPermFn) {
    return false;
  }
  return hasPermFn(code);
}

/**
 * 判断当前用户是否具备超级管理员权限
 */
export function isSuperAdminUser(roles?: string[]): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.includes('SUPER_ADMIN');
}
