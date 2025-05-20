import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisClientOptions } from 'redis';

@Module({
  imports: [
    // Configure the Throttler module with Redis
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_TTL', 60) * 1000, // Default 60 seconds
            limit: config.get('THROTTLE_LIMIT', 10), // Default 10 requests per TTL
          },
          {
            name: 'websocket',
            ttl: config.get('WS_THROTTLE_TTL', 5) * 1000, // Default 5 seconds
            limit: config.get('WS_THROTTLE_LIMIT', 50), // Default 50 messages per TTL
          },
          {
            name: 'ai-request',
            ttl: config.get('AI_THROTTLE_TTL', 60) * 1000, // Default 60 seconds
            limit: config.get('AI_THROTTLE_LIMIT', 5), // Default 5 AI requests per minute
          }
        ],
      }),
    }),
    
    // Configure the Redis cache
    CacheModule.registerAsync<RedisClientOptions>({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST', 'localhost');
        const redisPort = configService.get('REDIS_PORT', 6379);
        
        return {
          store: redisStore as any,
          url: `redis://${redisHost}:${redisPort}`,
          ttl: 60, // Default TTL in seconds
        };
      },
    }),
  ],
  exports: [ThrottlerModule, CacheModule],
})
export class RateLimitingModule {}
