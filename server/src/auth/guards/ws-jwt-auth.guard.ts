import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class WsJwtAuthGuard extends AuthGuard('ws-jwt') {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  getRequest(context: ExecutionContext) {
    const ws = context.switchToWs();
    const client = ws.getClient();
    
    // Return the socket directly - our strategy knows how to handle it
    return client;
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const client = context.switchToWs().getClient();
    
    if (err || !user) {
      let errorMessage = 'Unauthorized access';
      let errorCode = 'unauthorized';
      
      // Handle different types of authentication errors
      if (err) {
        if (err.name === 'TokenExpiredError') {
          errorMessage = 'Authentication token has expired';
          errorCode = 'token_expired';
        } else if (err.name === 'JsonWebTokenError') {
          errorMessage = 'Invalid authentication token';
          errorCode = 'invalid_token';
        } else if (err.name === 'NotBeforeError') {
          errorMessage = 'Token not yet valid';
          errorCode = 'token_not_active';
        } else {
          errorMessage = err.message || 'Authentication error';
        }
      } else if (!user) {
        errorMessage = 'User information missing from token';
        errorCode = 'invalid_user';
      }

      this.logger.error(`WebSocket authentication failed: ${errorMessage}`, err?.stack);
      
      // Close the connection with error details
      if (client.disconnect) {
        try {
          // Send error before disconnecting
          client.emit('error', {
            status: 'error',
            message: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString()
          });
          
          // Use setTimeout to ensure the error is sent before disconnecting
          setTimeout(() => client.disconnect(true), 100);
        } catch (disconnectErr) {
          this.logger.error('Error while disconnecting client', disconnectErr);
        }
      }
      
      throw new WsException({
        status: 'error',
        message: errorMessage,
        code: errorCode,
        timestamp: new Date().toISOString()
      });
    }

    // User is authenticated, log successful authentication
    this.logger.debug(`WebSocket authenticated for user: ${user.username || user.id}`);
    
    // User is already attached to socket.data by the strategy
    return user;
  }
}
