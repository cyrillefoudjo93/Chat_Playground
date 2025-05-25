import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  // Override for HTTP requests
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  // Add support for WebSocket connections
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (context.getType() === 'ws') {
      // Handle WebSocket authentication
      const client = context.switchToWs().getClient<Socket>();
      
      if (err || !user) {
        throw new WsException('Unauthorized access');
      }
      
      // Attach user to socket data for later access
      client.data.user = user;
      return user;
    }
    
    // Handle HTTP requests
    if (err || !user) {
      throw new UnauthorizedException('Unauthorized access');
    }
    
    return user;
  }
}
