import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Override for HTTP requests
  canActivate(context: ExecutionContext) {
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
