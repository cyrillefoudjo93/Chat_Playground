import { Module, Global } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { RedisClientOptions } from 'redis';

// Import our custom components
import { SimpleRateLimitGuard } from './guards/simple-rate-limit.guard';
import { WebSocketRateLimitGuard } from './guards/websocket-rate-limit.guard';
import { RedisThrottlerStorage } from './storage/redis-throttler.storage';
import { RateLimitingService } from './services/rate-limiting.service';
import { RateLimitingController } from './controllers/rate-limiting.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    
    // Configure the Throttler module
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_TTL', 60) * 1000, // Default 60 seconds
            limit: config.get('THROTTLE_LIMIT', 100), // Default 100 requests per TTL
          },
          {
            name: 'strict',
            ttl: config.get('STRICT_THROTTLE_TTL', 60) * 1000, // Default 60 seconds
            limit: config.get('STRICT_THROTTLE_LIMIT', 10), // Default 10 requests per TTL
          },
          {
            name: 'auth',
            ttl: config.get('AUTH_THROTTLE_TTL', 300) * 1000, // Default 5 minutes
            limit: config.get('AUTH_THROTTLE_LIMIT', 5), // Default 5 auth attempts per 5 min
          },
          {
            name: 'websocket',
            ttl: config.get('WS_THROTTLE_TTL', 10) * 1000, // Default 10 seconds
            limit: config.get('WS_THROTTLE_LIMIT', 100), // Default 100 messages per TTL
          },
          {
            name: 'ai-request',
            ttl: config.get('AI_THROTTLE_TTL', 60) * 1000, // Default 60 seconds
            limit: config.get('AI_THROTTLE_LIMIT', 20), // Default 20 AI requests per minute
          },
          {
            name: 'demo-token', // New throttler for demo token
            ttl: config.get('DEMO_TOKEN_THROTTLE_TTL', 60) * 1000, // Default 1 minute
            limit: config.get('DEMO_TOKEN_THROTTLE_LIMIT', 20), // Default 20 requests per minute
          }
        ],
        errorMessage: 'Rate limit exceeded. Please try again later.',
        skipIf: (context) => {
          // Skip rate limiting for health checks
          const request = context.switchToHttp().getRequest();
          return request?.url === '/health';
        },
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
        const redisPassword = configService.get('REDIS_PASSWORD');
        
        return {
          store: redisStore as any,
          url: `redis://${redisHost}:${redisPort}`,
          password: redisPassword,
          ttl: 60, // Default TTL in seconds
        };
      },
    }),
  ],
  controllers: [RateLimitingController],
  providers: [
    RedisThrottlerStorage,
    RateLimitingService,
    SimpleRateLimitGuard,
    WebSocketRateLimitGuard,
    {
      provide: APP_GUARD,
      useClass: SimpleRateLimitGuard,
    },
  ],
  exports: [
    ThrottlerModule, 
    CacheModule, 
    RateLimitingService, 
    SimpleRateLimitGuard,
    WebSocketRateLimitGuard,
    RedisThrottlerStorage,
  ],
})
export class RateLimitingModule {}
