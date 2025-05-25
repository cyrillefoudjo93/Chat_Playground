import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { 
  ThrottlerGuard, 
  ThrottlerException, 
  ThrottlerModuleOptions, 
  ThrottlerStorage,
  ThrottlerRequest 
} from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);
  private readonly trustedClients: Set<string>;
  private readonly trustedUserAgents: Set<string>;

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private configService: ConfigService,
  ) {
    super(options, storageService, reflector);
    
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
      // Call parent canActivate
      const canActivate = await super.canActivate(context);
      
      if (canActivate) {
        // Add rate limit headers for successful requests
        const throttlerInfo = await this.getThrottlerInfo(context);
        this.addRateLimitHeaders(response, throttlerInfo);
      }
      
      return canActivate;
    } catch (error) {
      if (error instanceof ThrottlerException) {
        // Get throttler info for rate limit exceeded scenario
        const throttlerInfo = await this.getThrottlerInfo(context);
        this.addRateLimitHeaders(response, {
          ...throttlerInfo,
          remaining: 0,
          retryAfter: Math.ceil(throttlerInfo.ttl / 1000),
        });
      }
      throw error;
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

  private async getThrottlerInfo(context: ExecutionContext): Promise<{
    limit: number | string;
    remaining: number | string;
    reset: Date;
    ttl: number;
    retryAfter?: number;
  }> {
    const request = context.switchToHttp().getRequest<Request>();
    const route = request.route?.path || request.url;
    
    // Default values based on route patterns
    let limit = 10;
    let ttl = 60000; // 60 seconds
    
    // Adjust based on endpoint type
    if (route.includes('/auth/')) {
      limit = this.configService.get('AUTH_THROTTLE_LIMIT', 5);
      ttl = this.configService.get('AUTH_THROTTLE_TTL', 60) * 1000;
    } else if (route.includes('/ai-providers/')) {
      limit = this.configService.get('AI_THROTTLE_LIMIT', 5);
      ttl = this.configService.get('AI_THROTTLE_TTL', 60) * 1000;
    } else if (route.includes('/socket.io/')) {
      limit = this.configService.get('WS_THROTTLE_LIMIT', 50);
      ttl = this.configService.get('WS_THROTTLE_TTL', 5) * 1000;
    } else {
      limit = this.configService.get('THROTTLE_LIMIT', 10);
      ttl = this.configService.get('THROTTLE_TTL', 60) * 1000;
    }
    
    return {
      limit,
      remaining: limit, // This would be calculated from Redis in real implementation
      reset: new Date(Date.now() + ttl),
      ttl,
    };
  }

  private addRateLimitHeaders(
    response: Response,
    info: {
      limit: number | string;
      remaining: number | string;
      reset: Date;
      retryAfter?: number;
    },
  ): void {
    response.setHeader('X-RateLimit-Limit', info.limit);
    response.setHeader('X-RateLimit-Remaining', info.remaining);
    response.setHeader('X-RateLimit-Reset', Math.floor(info.reset.getTime() / 1000));
    
    if (info.retryAfter !== undefined) {
      response.setHeader('Retry-After', info.retryAfter);
    }
    
    // Add CORS-compatible headers
    response.setHeader('Access-Control-Expose-Headers', 
      'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
    );
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context } = requestProps;
    const request = context.switchToHttp().getRequest<Request>();
    
    // Create a unique key for this client/endpoint combination
    const key = this.generateThrottlerKey(context, request);
    
    // Log rate limit attempt
    this.logger.debug(`Rate limit check for key: ${key}`);
    
    return super.handleRequest(requestProps);
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const request = context.switchToHttp().getRequest<Request>();
    return this.generateThrottlerKey(context, request);
  }

  private generateThrottlerKey(context: ExecutionContext, request: Request): string {
    const clientIp = this.getClientIp(request);
    const userId = (request as any).user?.id || 'anonymous';
    const endpoint = request.route?.path || request.url;
    
    return `throttle:${clientIp}:${userId}:${endpoint}`;
  }

  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const clientId = this.getClientIdentifier(request);
    
    this.logger.warn(`Rate limit exceeded for client: ${clientId}, endpoint: ${request.url}`);
    
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
}
