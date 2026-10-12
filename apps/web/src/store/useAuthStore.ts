import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { RoleCode } from '@car-control/contracts';

export interface UserInfo {
  id: string;
  tenantId: string;
  username: string;
  roles: (RoleCode | string)[];
  permissions: string[];
  displayName?: string;
  email?: string;
  avatar?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserInfo | null;
  permissions: string[];
  isAuthenticated: boolean;

  setAuth: (
    tokens: { accessToken: string; refreshToken: string },
    user: UserInfo,
    permissions?: string[]
  ) => void;
  setTokens: (tokens: { accessToken: string; refreshToken?: string }) => void;
  setUser: (user: UserInfo) => void;
  setPermissions: (permissions: string[]) => void;
  clearAuth: () => void;
  hasPermission: (permCode: string) => boolean;
}

const getSafeStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,

      setAuth: (tokens, user, permissions) => {
        const resolvedPermissions = permissions ?? user.permissions ?? [];
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          permissions: resolvedPermissions,
          isAuthenticated: true,
        });
      },

      setTokens: (tokens) => {
        set((state) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? state.refreshToken,
          isAuthenticated: Boolean(tokens.accessToken),
        }));
      },

      setUser: (user) => {
        set({
          user,
          permissions: user.permissions ?? [],
        });
      },

      setPermissions: (permissions) => {
        set({ permissions });
      },

      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          permissions: [],
          isAuthenticated: false,
        });
      },

      hasPermission: (permCode: string): boolean => {
        const state = get();
        if (!state.isAuthenticated) {
          return false;
        }

        const userRoles = state.user?.roles ?? [];
        if (userRoles.includes(RoleCode.SUPER_ADMIN) || userRoles.includes('SUPER_ADMIN')) {
          return true;
        }

        const userPerms = state.permissions;
        if (userPerms.includes('*') || userPerms.includes('*:*')) {
          return true;
        }

        if (userPerms.includes(permCode)) {
          return true;
        }

        // Support module:* wildcard matching, e.g. "device:*" matches "device:read"
        const [targetModule] = permCode.split(':');
        if (targetModule && userPerms.includes(`${targetModule}:*`)) {
          return true;
        }

        return false;
      },
    }),
    {
      name: 'car_control_auth_storage',
      storage: createJSONStorage(getSafeStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
