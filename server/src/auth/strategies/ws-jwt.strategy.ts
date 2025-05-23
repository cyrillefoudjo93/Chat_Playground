import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

// Custom token extractor for WebSocket connections
const extractTokenFromSocket = (socket: Socket): string | null => {
  try {
    // First check handshake auth token as it's the recommended way
    if (socket.handshake?.auth?.token) {
      const token = socket.handshake.auth.token;
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
    }

    // Then try authorization header
    const authHeader = socket.handshake?.headers?.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type?.toLowerCase() === 'bearer' && token?.length > 0) {
        return token;
      }
    }

    // Finally check query parameters (less secure, but sometimes needed)
    if (socket.handshake?.query?.token) {
      const token = socket.handshake.query.token;
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
    }

    throw new WsException('No valid authentication token found');
  } catch (error) {
    console.error('Error extracting token:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

@Injectable()
export class WsJwtStrategy extends PassportStrategy(Strategy, 'ws-jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: (req: any) => {
        try {
          // If request is a Socket instance
          if (req instanceof Socket || req?.handshake) {
            return extractTokenFromSocket(req);
          }
          
          // If request is from WebSocket guard's getRequest
          if (req && req.headers) {
            const authHeader = req.headers.authorization;
            if (authHeader) {
              const [type, token] = authHeader.split(' ');
              if (type?.toLowerCase() === 'bearer' && token) {
                return token;
              }
            }
          }
          
          // Add debugging
          console.debug('No token found in request. Request type:', typeof req);
          return null;
        } catch (error) {
          console.error('Error extracting JWT from request:', error);
          return null;
        }
      },
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'test-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any): Promise<any> {
    try {
      // Validate payload
      if (!payload) {
        throw new UnauthorizedException('Token payload is missing');
      }
      if (!payload.sub) {
        throw new UnauthorizedException('User ID is missing from token');
      }
      if (!payload.username && typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid user identifier');
      }

      const user = {
        id: payload.sub,
        username: payload.username || `user-${payload.sub}`,
        iat: payload.iat,
        exp: payload.exp
      };

      // For Socket instances, attach user data and validate connection
      if (req instanceof Socket || req?.handshake) {
        // Check token expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          throw new UnauthorizedException('Token has expired');
        }

        // Attach user data to socket
        req.data = { 
          user,
          authenticated: true,
          connectedAt: new Date().toISOString()
        };

        // Log successful authentication
        console.log(`WebSocket authenticated for user: ${user.username}`);
      }

      return user;
    } catch (error) {
      console.error('WebSocket authentication error:', error instanceof Error ? error.message : 'Unknown error');
      
      // Transform error to WsException with detailed information
      throw new WsException({
        status: 'error',
        message: 'Authentication failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }
}
