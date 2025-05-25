import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RedisThrottlerStorage } from '../storage/redis-throttler.storage';

@Injectable()
export class SimpleRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SimpleRateLimitGuard.name);
  private readonly trustedClients: Set<string>;
  private readonly trustedUserAgents: Set<string>;

  constructor(
    private configService: ConfigService,
    private redisStorage: RedisThrottlerStorage,
  ) {
    // Initialize trusted clients from environment variables
    const trustedIps = this.configService.get('TRUSTED_IPS', '').split(',').filter(Boolean);
    const trustedAgents = this.configService.get('TRUSTED_USER_AGENTS', '').split(',').filter(Boolean);
    
    this.trustedClients = new Set(trustedIps);
    this.trustedUserAgents = new Set(trustedAgents);
    
    this.logger.log(`Initialized with ${this.trustedClients.size} trusted IPs and ${this.trustedUserAgents.size} trusted user agents`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Check if client should bypass rate limiting
    if (this.shouldBypassRateLimit(request)) {
      this.logger.debug(`Bypassing rate limit for trusted client: ${this.getClientIdentifier(request)}`);
      this.addRateLimitHeaders(response, {
        limit: 'unlimited',
        remaining: 'unlimited',
        reset: new Date(Date.now() + 60000),
      });
      return true;
    }

    try {
      // Get rate limit configuration for this endpoint
      const { limit, ttl } = this.getRateLimitConfig(request);
      
      // Generate unique key for this client/endpoint
      const key = this.generateKey(request);
      
      // Check rate limit
      const result = await this.redisStorage.increment(key, ttl, limit, ttl, 'rate-limit');
      
      // Add rate limit headers
      this.addRateLimitHeaders(response, {
        limit,
        remaining: Math.max(0, limit - result.totalHits),
        reset: new Date(Date.now() + result.timeToExpire),
      });
      
      // Check if limit exceeded
      if (result.totalHits > limit) {
        this.logger.warn(`Rate limit exceeded for client: ${this.getClientIdentifier(request)}, key: ${key}, hits: ${result.totalHits}, limit: ${limit}`);
        
        // Add retry-after header
        response.setHeader('Retry-After', Math.ceil(result.timeToExpire / 1000));
        
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Please try again later.',
            error: 'Too Many Requests',
            timestamp: new Date().toISOString(),
            path: request.url,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      
      this.logger.debug(`Rate limit check passed for key: ${key}, hits: ${result.totalHits}/${limit}`);
      return true;
      
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Rate limit check failed: ${error.message}`, error.stack);
      // In case of Redis failure, allow the request to proceed
      return true;
    }
  }

  private shouldBypassRateLimit(request: Request): boolean {
    const clientIp = this.getClientIp(request);
    const userAgent = request.get('User-Agent') || '';
    
    // Check if IP is in trusted list
    if (this.trustedClients.has(clientIp)) {
      return true;
    }
    
    // Check if user agent is in trusted list
    for (const trustedAgent of this.trustedUserAgents) {
      if (userAgent.includes(trustedAgent)) {
        return true;
      }
    }
    
    // Check for admin API key
    const apiKey = request.get('X-Admin-API-Key');
    const adminApiKey = this.configService.get('ADMIN_API_KEY');
    if (apiKey && adminApiKey && apiKey === adminApiKey) {
      return true;
    }
    
    // Check for internal service header
    const isInternalService = request.get('X-Internal-Service') === 'true';
    if (isInternalService) {
      return true;
    }
    
    return false;
  }

  private getRateLimitConfig(request: Request): { limit: number; ttl: number } {
    const route = request.route?.path || request.url;
    
    // Health checks - very high limit
    if (route.includes('/health')) {
      return {
        limit: this.configService.get('HEALTH_THROTTLE_LIMIT', 1000),
        ttl: this.configService.get('HEALTH_THROTTLE_TTL', 60),
      };
    }

    // Demo token endpoint - specific, more lenient limit
    // Ensure this check is specific enough and correctly matches the route.
    // Given controller 'auth' and route 'demo-token', request.url might be '/auth/demo-token'
    // and request.route?.path might be '/auth/demo-token' or similar.
    if (route === '/auth/demo-token' || route.endsWith('/auth/demo-token')) {
      this.logger.debug(`Applying demo-token rate limit for route: ${route}`);
      return {
        limit: this.configService.get('DEMO_TOKEN_THROTTLE_LIMIT', 20), // Default 20
        ttl: this.configService.get('DEMO_TOKEN_THROTTLE_TTL', 60),    // Default 60 seconds
      };
    }
    
    // Auth endpoints - strict limits (ensure this doesn't override demo-token)
    if (route.includes('/auth/')) {
      this.logger.debug(`Applying auth rate limit for route: ${route}`);
      return {
        limit: this.configService.get('AUTH_THROTTLE_LIMIT', 5),
        ttl: this.configService.get('AUTH_THROTTLE_TTL', 300), // 5 minutes
      };
    }
    
    // AI provider endpoints - moderate limits
    if (route.includes('/ai-providers/')) {
      return {
        limit: this.configService.get('AI_THROTTLE_LIMIT', 20),
        ttl: this.configService.get('AI_THROTTLE_TTL', 60), // 1 minute
      };
    }
    
    // Default limits
    return {
      limit: this.configService.get('THROTTLE_LIMIT', 100),
      ttl: this.configService.get('THROTTLE_TTL', 60), // 1 minute
    };
  }

  private generateKey(request: Request): string {
    const clientIp = this.getClientIp(request);
    const userId = (request as any).user?.id || 'anonymous';
    const endpoint = request.route?.path || request.url;
    const method = request.method;
    
    return `rate_limit:${clientIp}:${userId}:${method}:${endpoint}`;
  }

  private getClientIp(request: Request): string {
    // Check for forwarded IPs (for load balancers/proxies)
    const forwarded = request.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = request.get('X-Real-IP');
    if (realIp) {
      return realIp;
    }
    
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private getClientIdentifier(request: Request): string {
    const ip = this.getClientIp(request);
    const userAgent = request.get('User-Agent') || 'unknown';
    return `${ip} (${userAgent})`;
  }

  private addRateLimitHeaders(
    response: Response,
    info: {
      limit: number | string;
      remaining: number | string;
      reset: Date;
    },
  ): void {
    response.setHeader('X-RateLimit-Limit', info.limit);
    response.setHeader('X-RateLimit-Remaining', info.remaining);
    response.setHeader('X-RateLimit-Reset', Math.floor(info.reset.getTime() / 1000));
    
    // Add CORS-compatible headers
    response.setHeader('Access-Control-Expose-Headers', 
      'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
    );
  }
}
