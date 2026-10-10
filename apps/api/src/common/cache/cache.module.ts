import { Module, Global } from '@nestjs/common';
import { InMemoryLockAdapter } from './in-memory-cache.adapter.js';
import { RedisLockAdapter } from './redis-cache.adapter.js';

@Global()
@Module({
  providers: [
    InMemoryLockAdapter,
    RedisLockAdapter,
    {
      provide: 'DistributedLockPort',
      useFactory: (inMemory: InMemoryLockAdapter, redis: RedisLockAdapter) => {
        return process.env.CACHE_DRIVER === 'redis' ? redis : inMemory;
      },
      inject: [InMemoryLockAdapter, RedisLockAdapter],
    },
    {
      provide: 'CachePort',
      useFactory: (inMemory: InMemoryLockAdapter, redis: RedisLockAdapter) => {
        return process.env.CACHE_DRIVER === 'redis' ? redis : inMemory;
      },
      inject: [InMemoryLockAdapter, RedisLockAdapter],
    },
  ],
  exports: [
    'DistributedLockPort',
    'CachePort',
    InMemoryLockAdapter,
    RedisLockAdapter,
  ],
})
export class CacheModule {}
