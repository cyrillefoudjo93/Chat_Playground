import {
  Injectable,
  Logger,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RateLimitingService } from '../services/rate-limiting.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebSocketRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WebSocketRateLimitGuard.name);
  private readonly trustedClients: Set<string>;

  constructor(
    private rateLimitingService: RateLimitingService,
    private configService: ConfigService,
  ) {
    // Initialize trusted clients from environment variables
    const trustedIps = this.configService.get('TRUSTED_IPS', '').split(',').filter(Boolean);
    this.trustedClients = new Set(trustedIps);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();
    
    // Check if client should bypass rate limiting
    if (this.shouldBypassRateLimit(client)) {
      this.logger.debug(`Bypassing WebSocket rate limit for trusted client: ${client.id}`);
      return true;
    }

    // Get the event type for more specific rate limiting
    const eventType = context.getHandler().name || 'unknown';
    
    // Generate client key
    const clientKey = this.generateClientKey(client, eventType);
    
    // Get appropriate rule for WebSocket events
    const rule = this.rateLimitingService.getRuleForRequest('/socket.io/events', 'POST');
    
    if (!rule) {
      this.logger.warn('No rate limiting rule found for WebSocket events');
      return true;
    }

    try {
      const result = await this.rateLimitingService.checkRateLimit(clientKey, rule);
      
      if (!result.allowed) {
        this.logger.warn(
          `WebSocket rate limit exceeded for client ${client.id}, event: ${eventType}`,
        );
        
        // Send rate limit error to client
        client.emit('error', {
          type: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
          retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        });
        
        throw new WsException({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        });
      }
      
      // Add rate limit info to socket for potential use by handlers
      (client as any).rateLimitInfo = {
        remaining: result.remaining,
        resetTime: result.resetTime,
        rule: rule.name,
      };
      
      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }
      
      this.logger.error(`WebSocket rate limit check failed for client ${client.id}:`, error);
      // Fail open for system errors
      return true;
    }
  }

  private shouldBypassRateLimit(client: Socket): boolean {
    const clientIp = this.getClientIp(client);
    
    // Check if IP is in trusted list
    if (this.trustedClients.has(clientIp)) {
      return true;
    }
    
    // Check for admin authentication
    const authData = client.handshake.auth;
    if (authData?.isAdmin === true) {
      return true;
    }
    
    // Check for internal service header
    const isInternalService = client.handshake.headers['x-internal-service'] === 'true';
    if (isInternalService) {
      return true;
    }
    
    return false;
  }

  private getClientIp(client: Socket): string {
    // Check for forwarded IPs (for load balancers/proxies)
    const forwarded = client.handshake.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = client.handshake.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp;
    }
    
    return client.handshake.address || 'unknown';
  }

  private generateClientKey(client: Socket, eventType: string): string {
    const ip = this.getClientIp(client);
    const userId = (client as any).user?.id || 'anonymous';
    
    return `websocket:${ip}:${userId}:${eventType}`;
  }
}

// Decorator for applying WebSocket rate limiting to specific events
export function WSRateLimit(eventName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // This decorator could be used to apply rate limiting to specific WebSocket event handlers
    // For now, it's a placeholder that could be enhanced with specific rate limiting logic
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Additional rate limiting logic specific to the event could go here
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}
