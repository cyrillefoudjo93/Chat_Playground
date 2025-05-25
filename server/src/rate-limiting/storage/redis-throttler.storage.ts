import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'throttle:';

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);
    const redisPassword = this.configService.get('REDIS_PASSWORD');
    const redisDb = this.configService.get('REDIS_DB', 0);

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      },
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`, error.stack);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis is ready');
    });
  }

  async onModuleDestroy() {
    if (this.redis && this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = this.keyPrefix + key;
    
    try {
      // Use a Lua script for atomic increment and TTL setting
      const luaScript = `
        local key = KEYS[1]
        local ttl = tonumber(ARGV[1])
        local current = redis.call('GET', key)
        
        if current == false then
          redis.call('SET', key, 1, 'EX', ttl)
          return {1, ttl * 1000, 0}
        else
          local newValue = redis.call('INCR', key)
          local timeToExpire = redis.call('TTL', key)
          if timeToExpire == -1 then
            redis.call('EXPIRE', key, ttl)
            timeToExpire = ttl
          end
          return {newValue, timeToExpire * 1000, 0}
        end
      `;

      const result = await this.redis.eval(luaScript, 1, redisKey, ttl) as [number, number, number];
      const [totalHits, timeToExpire, timeToBlockExpire] = result;

      return {
        totalHits,
        timeToExpire,
        isBlocked: false,
        timeToBlockExpire,
      };
    } catch (error) {
      this.logger.error(`Failed to increment throttle key ${key}:`, error);
      // Fallback to allow request if Redis is down (fail open)
      return {
        totalHits: 0,
        timeToExpire: ttl * 1000,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  // Custom increment method for our simple rate limit guard
  async simpleIncrement(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const redisKey = this.keyPrefix + key;
    
    try {
      // Use a Lua script for atomic increment and TTL setting
      const luaScript = `
        local key = KEYS[1]
        local ttl = tonumber(ARGV[1])
        local current = redis.call('GET', key)
        
        if current == false then
          redis.call('SET', key, 1, 'EX', ttl)
          return {1, ttl * 1000}
        else
          local newValue = redis.call('INCR', key)
          local timeToExpire = redis.call('TTL', key)
          if timeToExpire == -1 then
            redis.call('EXPIRE', key, ttl)
            timeToExpire = ttl
          end
          return {newValue, timeToExpire * 1000}
        end
      `;

      const result = await this.redis.eval(luaScript, 1, redisKey, ttl) as [number, number];
      const [totalHits, timeToExpire] = result;

      return {
        totalHits,
        timeToExpire,
      };
    } catch (error) {
      this.logger.error(`Failed to increment throttle key ${key}:`, error);
      // Fallback to allow request if Redis is down (fail open)
      return {
        totalHits: 0,
        timeToExpire: ttl * 1000,
      };
    }
  }

  async reset(key: string): Promise<void> {
    const redisKey = this.keyPrefix + key;
    
    try {
      await this.redis.del(redisKey);
      this.logger.debug(`Reset throttle key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to reset throttle key ${key}:`, error);
    }
  }

  async getRecord(key: string): Promise<ThrottlerStorageRecord[]> {
    const redisKey = this.keyPrefix + key;
    
    try {
      const current = await this.redis.get(redisKey);
      const ttl = await this.redis.ttl(redisKey);
      
      if (current === null) {
        return [];
      }

      return [{
        totalHits: parseInt(current, 10),
        timeToExpire: ttl > 0 ? ttl * 1000 : 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }];
    } catch (error) {
      this.logger.error(`Failed to get throttle record for key ${key}:`, error);
      return [];
    }
  }

  async getStats(): Promise<{
    totalKeys: number;
    activeConnections: number;
    memoryUsage: string;
  }> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      
      return {
        totalKeys: keys.length,
        activeConnections: 1,
        memoryUsage: memoryMatch ? memoryMatch[1].trim() : 'unknown',
      };
    } catch (error) {
      this.logger.error('Failed to get throttle stats:', error);
      return {
        totalKeys: 0,
        activeConnections: 0,
        memoryUsage: 'unknown',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  async getTopClients(limit: number): Promise<Array<{ key: string; hits: number; ttl: number }>> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      const clientStats: Array<{ key: string; hits: number; ttl: number }> = [];

      for (const key of keys) {
        const count = await this.redis.get(key);
        const ttl = await this.redis.ttl(key);
        if (count) {
          const clientKey = key.replace(this.keyPrefix, '');
          clientStats.push({
            key: clientKey,
            hits: parseInt(count, 10),
            ttl: ttl > 0 ? ttl : 0,
          });
        }
      }

      return clientStats
        .sort((a, b) => b.hits - a.hits)
        .slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get top clients:', error);
      return [];
    }
  }

  async clearRecords(): Promise<void> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Cleared ${keys.length} rate limiting records`);
      }
    } catch (error) {
      this.logger.error('Failed to clear records:', error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Only call if not already destroyed
    if (this.redis && this.redis.status !== 'end') {
      await this.onModuleDestroy();
    }
  }
}
