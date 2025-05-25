import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { RateLimitingModule } from '../rate-limiting.module';
import { RedisThrottlerStorage } from '../storage/redis-throttler.storage';
import { RateLimitingService } from '../services/rate-limiting.service';
import { CustomThrottlerGuard } from '../guards/custom-throttler.guard';
import { AppController } from '../../app.controller';
import { AppService } from '../../app.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';

describe('Rate Limiting Integration', () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeEach(async () => {
    // Set low rate limits for testing
    process.env.THROTTLE_LIMIT = '2';
    process.env.THROTTLE_TTL = '10';
    
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ThrottlerModule.forRoot([
          {
            name: 'short',
            ttl: 1000,
            limit: 2, // Very low limit to ensure it triggers
          },
          {
            name: 'medium',
            ttl: 10000,
            limit: 20,
          },
        ]),
        RateLimitingModule,
      ],
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: APP_GUARD,
          useClass: CustomThrottlerGuard,
        },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true }) // Mock JWT auth for testing
    .compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    // Reset rate limiting service state between tests
    try {
      const rateLimitingService = module.get<RateLimitingService>(RateLimitingService);
      
      // Clear all rules except default ones and reset stats
      if (rateLimitingService) {
        // Get current rules and remove non-default ones
        const currentRules = rateLimitingService.listRules();
        const defaultRuleNames = ['global', 'auth-login', 'auth-refresh', 'ai-request', 'websocket-connect', 'health-check'];
        
        for (const rule of currentRules) {
          if (!defaultRuleNames.includes(rule.name)) {
            rateLimitingService.removeRule(rule.name);
          }
        }
        
        // Clear Redis data and reset stats
        await rateLimitingService.clearAllLimits();
      }
    } catch (error) {
      // Ignore errors during state reset
    }
  });

  afterEach(async () => {
    // Clean up Redis connections properly
    try {
      const redisStorage = module.get<RedisThrottlerStorage>(RedisThrottlerStorage);
      if (redisStorage) {
        await redisStorage.onModuleDestroy();
      }
    } catch (error) {
      // Ignore cleanup errors - connection might already be closed
    }
    
    try {
      await app.close();
    } catch (error) {
      // Ignore close errors
    }
    
    try {
      await module.close();
    } catch (error) {
      // Ignore close errors
    }
  });

  describe('Rate Limiting Headers', () => {
    it('should add rate limit headers to responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should include Retry-After header when rate limit exceeded', async () => {
      // Use root endpoint which should use global rate limit rule
      // Make multiple requests to exceed rate limit (limit is 2)
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/');
      }

      const response = await request(app.getHttpServer())
        .get('/')
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
      expect(parseInt(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('Bypass Mechanisms', () => {
    it('should bypass rate limiting for trusted IP addresses', async () => {
      // Set trusted IP in request
      const trustedIp = '127.0.0.1';
      
      // Make more requests than the limit allows
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .get('/health')
          .set('X-Forwarded-For', trustedIp)
          .expect(200);
        
        // Should have unlimited rate limit for trusted IPs
        expect(response.headers['x-ratelimit-limit']).toBe('unlimited');
      }
    });

    it('should bypass rate limiting with valid admin API key', async () => {
      const adminApiKey = process.env.ADMIN_API_KEY || 'test-admin-key';
      
      // Make more requests than the limit allows
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get('/health')
          .set('X-API-Key', adminApiKey)
          .expect(200);
      }
    });

    it('should bypass rate limiting with internal service header', async () => {
      const internalHeader = process.env.INTERNAL_SERVICE_HEADER || 'X-Internal-Service';
      
      // Make more requests than the limit allows
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get('/health')
          .set(internalHeader, 'true')
          .expect(200);
      }
    });
  });

  describe('Redis Storage', () => {
    let redisStorage: RedisThrottlerStorage;

    beforeEach(() => {
      redisStorage = module.get<RedisThrottlerStorage>(RedisThrottlerStorage);
    });

    it('should increment and track requests in Redis', async () => {
      const key = 'test-key';
      const ttl = 60;

      const result1 = await redisStorage.increment(key, ttl, 10, ttl, 'test');
      expect(result1.totalHits).toBe(1);
      expect(result1.timeToExpire).toBeLessThanOrEqual(ttl * 1000);

      const result2 = await redisStorage.increment(key, ttl, 10, ttl, 'test');
      expect(result2.totalHits).toBe(2);
      expect(result2.timeToExpire).toBeLessThanOrEqual(ttl * 1000);
    });

    it('should reset counter after TTL expires', async () => {
      const key = 'test-expiry-key';
      const shortTtl = 1; // 1 second

      const result1 = await redisStorage.increment(key, shortTtl, 1, shortTtl, 'test');
      expect(result1.totalHits).toBe(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result2 = await redisStorage.increment(key, shortTtl, 1, shortTtl, 'test');
      expect(result2.totalHits).toBe(1); // Should reset to 1
    });
  });

  describe('Rate Limiting Service', () => {
    it('should create and retrieve rate limit rules', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/rate-limiting/rules')
        .send({
          name: 'test-rule',
          path: '/test/*',
          method: 'GET',
          limit: 100,
          ttl: 3600,
          skipIf: 'req.headers["x-skip"] === "true"',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('test-rule');

      const getRulesResponse = await request(app.getHttpServer())
        .get('/admin/rate-limiting/rules')
        .expect(200);

      expect(getRulesResponse.body).toContainEqual(
        expect.objectContaining({
          name: 'test-rule',
          limit: 100,
        })
      );
    });

    it('should update existing rate limit rules', async () => {
      // Create a rule first
      await request(app.getHttpServer())
        .post('/admin/rate-limiting/rules')
        .send({
          name: 'update-test',
          path: '/test/*',
          method: 'GET',
          limit: 50,
          ttl: 1800,
        });

      // Update the rule
      const response = await request(app.getHttpServer())
        .put('/admin/rate-limiting/rules/update-test')
        .send({
          limit: 150,
          ttl: 7200,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('update-test');
    });

    it('should delete rate limit rules', async () => {
      // Create a rule first
      await request(app.getHttpServer())
        .post('/admin/rate-limiting/rules')
        .send({
          name: 'delete-test',
          path: '/test/*',
          method: 'GET',
          limit: 50,
          ttl: 1800,
        });

      // Delete the rule
      await request(app.getHttpServer())
        .delete('/admin/rate-limiting/rules/delete-test')
        .expect(200);

      // Verify it's deleted
      const getRulesResponse = await request(app.getHttpServer())
        .get('/admin/rate-limiting/rules')
        .expect(200);

      expect(getRulesResponse.body).not.toContainEqual(
        expect.objectContaining({
          name: 'delete-test',
        })
      );
    });
  });

  describe('Rate Limiting Statistics', () => {
    it('should provide rate limiting statistics', async () => {
      // Make some requests to generate stats
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).get('/health');
      }

      const response = await request(app.getHttpServer())
        .get('/admin/rate-limiting/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalRequests');
      expect(response.body).toHaveProperty('blockedRequests'); // Actual property name
      expect(response.body).toHaveProperty('topClients'); // Actual property name
      expect(response.body).toHaveProperty('activeRules');
      expect(response.body.totalRequests).toBeGreaterThanOrEqual(0);
    });
  });
});
