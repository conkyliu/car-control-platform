import React from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { LoginView } from '../views/auth/LoginView.tsx';
import { AdminLayout } from '../layouts/AdminLayout.tsx';
import { resolveAuthRoute } from '../layouts/admin-layout-core.ts';

export const AuthGuard: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const routeState = resolveAuthRoute(isAuthenticated);

  if (routeState === 'LOGIN') {
    return <LoginView />;
  }

  return <AdminLayout />;
};

export default AuthGuard;
