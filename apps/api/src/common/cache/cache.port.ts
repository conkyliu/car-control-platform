export interface LockHandle {
  resource: string;
  token: string;
  ttlMs: number;
  acquiredAt: number;
}

export interface DistributedLockPort {
  acquire(resource: string, ttlMs: number, waitTimeoutMs?: number): Promise<LockHandle | null>;
  release(handle: LockHandle): Promise<boolean>;
  withLock<T>(resource: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
