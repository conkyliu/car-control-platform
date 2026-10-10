import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CachePort, DistributedLockPort, LockHandle } from './cache.port.js';

interface LockEntry {
  token: string;
  expireAt: number;
  timer: NodeJS.Timeout;
}

interface CacheEntry {
  value: unknown;
  expireAt?: number;
  timer?: NodeJS.Timeout;
}

@Injectable()
export class InMemoryLockAdapter implements DistributedLockPort, CachePort {
  private lockStore: Map<string, LockEntry> = new Map();
  private cacheStore: Map<string, CacheEntry> = new Map();

  /**
   * 获取分布式排他锁
   * @param resource 资源唯一标识 (如 lock:cmd:{tenantId}:{vehicleId})
   * @param ttlMs 锁生存时间 (毫秒)
   * @param waitTimeoutMs 等待获取锁的最大超时时间 (毫秒)，可选
   */
  async acquire(
    resource: string,
    ttlMs: number,
    waitTimeoutMs?: number
  ): Promise<LockHandle | null> {
    const startTime = Date.now();
    const waitLimit = waitTimeoutMs && waitTimeoutMs > 0 ? waitTimeoutMs : 0;

    while (true) {
      const now = Date.now();
      const existing = this.lockStore.get(resource);

      // 如果当前无锁或锁已过期
      if (!existing || now >= existing.expireAt) {
        if (existing?.timer) {
          clearTimeout(existing.timer);
        }

        const token = randomUUID();
        const expireAt = now + ttlMs;
        const timer = setTimeout(() => {
          const current = this.lockStore.get(resource);
          if (current && current.token === token) {
            this.lockStore.delete(resource);
          }
        }, ttlMs);

        timer.unref?.();

        this.lockStore.set(resource, {
          token,
          expireAt,
          timer,
        });

        return {
          resource,
          token,
          ttlMs,
          acquiredAt: now,
        };
      }

      // 如果有锁且不需要等待
      if (waitLimit <= 0) {
        return null;
      }

      // 检查等待是否超时
      if (Date.now() - startTime >= waitLimit) {
        return null;
      }

      // 等待 10ms 后重试
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * 安全释放锁 (校验 token 一致性，防误删他人持有的锁)
   */
  async release(handle: LockHandle): Promise<boolean> {
    const existing = this.lockStore.get(handle.resource);
    if (!existing) {
      return false;
    }

    if (existing.token === handle.token) {
      clearTimeout(existing.timer);
      this.lockStore.delete(handle.resource);
      return true;
    }

    return false;
  }

  /**
   * 自动释放的排他锁执行包装器
   */
  async withLock<T>(resource: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const handle = await this.acquire(resource, ttlMs);
    if (!handle) {
      throw new Error('LOCK_ACQUISITION_FAILED');
    }

    try {
      return await fn();
    } finally {
      await this.release(handle);
    }
  }

  /**
   * 读取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cacheStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expireAt && Date.now() > entry.expireAt) {
      if (entry.timer) clearTimeout(entry.timer);
      this.cacheStore.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * 写入缓存
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const existing = this.cacheStore.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    if (ttlSeconds && ttlSeconds > 0) {
      const ttlMs = ttlSeconds * 1000;
      const expireAt = Date.now() + ttlMs;
      const timer = setTimeout(() => {
        this.cacheStore.delete(key);
      }, ttlMs);

      timer.unref?.();

      this.cacheStore.set(key, {
        value,
        expireAt,
        timer,
      });
    } else {
      this.cacheStore.set(key, {
        value,
      });
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    const existing = this.cacheStore.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    this.cacheStore.delete(key);
  }

  /**
   * 判断键是否存在
   */
  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
