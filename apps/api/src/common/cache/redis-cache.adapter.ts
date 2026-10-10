import { Injectable, Optional, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CachePort, DistributedLockPort, LockHandle } from './cache.port.js';
import { InMemoryLockAdapter } from './in-memory-cache.adapter.js';

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<string | null | 'OK'>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  eval(script: string, numkeys: number, ...args: any[]): Promise<any>;
}

@Injectable()
export class RedisLockAdapter implements DistributedLockPort, CachePort {
  private readonly fallbackAdapter = new InMemoryLockAdapter();
  private readonly luaReleaseScript =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

  constructor(@Optional() @Inject('REDIS_CLIENT') private readonly client?: RedisClientLike) {}

  /**
   * 基于 Redis SET key token PX ttlMs NX 实现分布式排他锁
   */
  async acquire(
    resource: string,
    ttlMs: number,
    waitTimeoutMs?: number
  ): Promise<LockHandle | null> {
    if (!this.client) {
      return this.fallbackAdapter.acquire(resource, ttlMs, waitTimeoutMs);
    }

    const startTime = Date.now();
    const waitLimit = waitTimeoutMs && waitTimeoutMs > 0 ? waitTimeoutMs : 0;

    while (true) {
      const token = randomUUID();
      const res = await this.client.set(resource, token, 'PX', ttlMs, 'NX');

      if (res === 'OK') {
        return {
          resource,
          token,
          ttlMs,
          acquiredAt: Date.now(),
        };
      }

      if (waitLimit <= 0 || Date.now() - startTime >= waitLimit) {
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * 基于 Redis Lua 脚本安全释放锁 (比较 token 后原子删除)
   */
  async release(handle: LockHandle): Promise<boolean> {
    if (!this.client) {
      return this.fallbackAdapter.release(handle);
    }

    const res = await this.client.eval(this.luaReleaseScript, 1, handle.resource, handle.token);
    return Number(res) === 1;
  }

  /**
   * 自动释放锁执行包装器
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
    if (!this.client) {
      return this.fallbackAdapter.get<T>(key);
    }

    const raw = await this.client.get(key);
    if (raw === null || raw === undefined) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * 写入缓存
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      return this.fallbackAdapter.set<T>(key, value, ttlSeconds);
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    if (!this.client) {
      return this.fallbackAdapter.del(key);
    }

    await this.client.del(key);
  }

  /**
   * 检查缓存是否存在
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return this.fallbackAdapter.exists(key);
    }

    const count = await this.client.exists(key);
    return Number(count) > 0;
  }
}
