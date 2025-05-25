import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from '../storage/redis-throttler.storage';

export interface RateLimitRule {
  name: string;
  path: string;
  method?: string;
  ttl: number; // Time window in seconds
  limit: number; // Max requests per time window
  skipIf?: (request: any) => boolean;
  keyGenerator?: (request: any) => string;
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  topClients: Array<{ key: string; hits: number; ttl: number }>;
  activeRules: RateLimitRule[];
  redisHealth: boolean;
}

@Injectable()
export class RateLimitingService {
  private readonly logger = new Logger(RateLimitingService.name);
  private readonly rules: Map<string, RateLimitRule> = new Map();
  private stats = {
    totalRequests: 0,
    blockedRequests: 0,
  };

  constructor(
    private configService: ConfigService,
    private redisStorage: RedisThrottlerStorage,
  ) {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    const defaultRules: RateLimitRule[] = [
      {
        name: 'global',
        path: '*',
        ttl: this.configService.get('THROTTLE_TTL', 60),
        limit: this.configService.get('THROTTLE_LIMIT', 100),
      },
      {
        name: 'auth-login',
        path: '/auth/okta',
        method: 'GET',
        ttl: this.configService.get('AUTH_THROTTLE_TTL', 300), // 5 minutes
        limit: this.configService.get('AUTH_THROTTLE_LIMIT', 5),
      },
      {
        name: 'auth-refresh',
        path: '/auth/refresh',
        method: 'POST',
        ttl: this.configService.get('AUTH_REFRESH_TTL', 60),
        limit: this.configService.get('AUTH_REFRESH_LIMIT', 10),
      },
      {
        name: 'ai-request',
        path: '/ai-providers/*',
        ttl: this.configService.get('AI_THROTTLE_TTL', 60),
        limit: this.configService.get('AI_THROTTLE_LIMIT', 20),
      },
      {
        name: 'websocket-connect',
        path: '/socket.io/*',
        ttl: this.configService.get('WS_THROTTLE_TTL', 10),
        limit: this.configService.get('WS_THROTTLE_LIMIT', 100),
      },
      {
        name: 'health-check',
        path: '/health',
        ttl: 60,
        limit: 1000, // Very high limit for health checks
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.name, rule);
    });

    this.logger.log(`Initialized ${defaultRules.length} rate limiting rules`);
  }

  getRuleForRequest(path: string, method?: string): RateLimitRule | null {
    // Check for exact path matches first
    for (const rule of this.rules.values()) {
      if (this.matchesRule(rule, path, method)) {
        return rule;
      }
    }

    // Return global rule as fallback
    return this.rules.get('global') || null;
  }

  private matchesRule(rule: RateLimitRule, path: string, method?: string): boolean {
    // Check method if specified
    if (rule.method && method && rule.method.toLowerCase() !== method.toLowerCase()) {
      return false;
    }

    // Check path
    if (rule.path === '*') {
      return true;
    }

    if (rule.path.endsWith('*')) {
      const basePath = rule.path.slice(0, -1);
      return path.startsWith(basePath);
    }

    return rule.path === path;
  }

  async checkRateLimit(
    clientKey: string,
    rule: RateLimitRule,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    try {
      this.stats.totalRequests++;

      const record = await this.redisStorage.increment(clientKey, rule.ttl, rule.limit, rule.ttl, rule.name);
      const allowed = record.totalHits <= rule.limit;
      
      if (!allowed) {
        this.stats.blockedRequests++;
        this.logger.warn(`Rate limit exceeded for key: ${clientKey}, rule: ${rule.name}`);
      }

      return {
        allowed,
        remaining: Math.max(0, rule.limit - record.totalHits),
        resetTime: new Date(Date.now() + (record.timeToExpire * 1000)),
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed for key ${clientKey}:`, error);
      // Fail open - allow request if there's an error
      return {
        allowed: true,
        remaining: rule.limit,
        resetTime: new Date(Date.now() + (rule.ttl * 1000)),
      };
    }
  }

  async resetClientLimit(clientKey: string): Promise<void> {
    try {
      await this.redisStorage.reset(clientKey);
      this.logger.log(`Reset rate limit for client: ${clientKey}`);
    } catch (error) {
      this.logger.error(`Failed to reset rate limit for client ${clientKey}:`, error);
      throw error;
    }
  }

  async getStats(): Promise<RateLimitStats> {
    try {
      const redisStats = await this.redisStorage.getStats();
      const topClients = await this.redisStorage.getTopClients(10);
      const redisHealth = await this.redisStorage.healthCheck();

      return {
        totalRequests: this.stats.totalRequests,
        blockedRequests: this.stats.blockedRequests,
        topClients,
        activeRules: Array.from(this.rules.values()),
        redisHealth,
      };
    } catch (error) {
      this.logger.error('Failed to get rate limiting stats:', error);
      throw error;
    }
  }

  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);
    this.logger.log(`Added rate limiting rule: ${rule.name}`);
  }

  removeRule(name: string): boolean {
    const removed = this.rules.delete(name);
    if (removed) {
      this.logger.log(`Removed rate limiting rule: ${name}`);
    }
    return removed;
  }

  updateRule(name: string, updates: Partial<RateLimitRule>): boolean {
    const rule = this.rules.get(name);
    if (!rule) {
      return false;
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(name, updatedRule);
    this.logger.log(`Updated rate limiting rule: ${name}`);
    return true;
  }

  listRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  generateClientKey(request: any, rule: RateLimitRule): string {
    if (rule.keyGenerator) {
      return rule.keyGenerator(request);
    }

    // Default key generation logic
    const ip = this.getClientIp(request);
    const userId = request.user?.id || 'anonymous';
    const path = request.route?.path || request.url;
    
    return `${rule.name}:${ip}:${userId}:${path}`;
  }

  private getClientIp(request: any): string {
    const forwarded = request.get?.('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = request.get?.('X-Real-IP');
    if (realIp) {
      return realIp;
    }
    
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  async clearAllLimits(): Promise<void> {
    try {
      await this.redisStorage.clearRecords();
      this.stats.totalRequests = 0;
      this.stats.blockedRequests = 0;
      this.logger.log('Cleared all rate limits and reset stats');
    } catch (error) {
      this.logger.error('Failed to clear all rate limits:', error);
      throw error;
    }
  }

  // Method to handle graceful shutdown
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Rate limiting service shutting down...');
    await this.redisStorage.onApplicationShutdown();
  }
}
