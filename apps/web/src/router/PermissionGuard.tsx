import React from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { checkPermission } from '../layouts/admin-layout-core.ts';

export interface PermissionGuardProps {
  code: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * 细粒度操作按钮/组件级权限守卫
 * 示例：<PermissionGuard code="device:write">{btn}</PermissionGuard>
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  code,
  children,
  fallback = null,
}) => {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const permitted = checkPermission(hasPermission, code);

  if (!permitted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default PermissionGuard;
