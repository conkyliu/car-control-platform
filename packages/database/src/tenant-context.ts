import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantSession {
  tenantId: string;
  userId: string;
  roles?: string[];
  projectId?: string;
}

export class TenantContext {
  private static storage = new AsyncLocalStorage<TenantSession>();

  /**
   * 在指定的租户上下文中执行异步代码块
   */
  static run<T>(session: TenantSession, callback: () => T): T {
    return this.storage.run(session, callback);
  }

  /**
   * 获取当前租户会话。如果当前上下文无租户信息，则抛出安全异常。
   */
  static getRequired(): TenantSession {
    const session = this.storage.getStore();
    if (!session || !session.tenantId) {
      throw new Error('[Security] TenantContext required: operation attempted without tenant scope');
    }
    return session;
  }

  /**
   * 获取当前租户 ID
   */
  static getTenantId(): string {
    return this.getRequired().tenantId;
  }

  /**
   * 获取当前可选的会话（无异常版本）
   */
  static getOptional(): TenantSession | undefined {
    return this.storage.getStore();
  }
}
