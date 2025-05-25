import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

// Custom token extractor for WebSocket connections
const extractTokenFromSocket = (socket: Socket): string | null => {
  console.log('WsJwtStrategy: Attempting to extract token from socket handshake:', JSON.stringify(socket.handshake, null, 2)); // Log entire handshake

  try {
    // First check handshake auth token
    console.log('WsJwtStrategy: Checking socket.handshake.auth...');
    if (socket.handshake?.auth?.token) {
      const token = socket.handshake.auth.token;
      console.log('WsJwtStrategy: Found token in socket.handshake.auth:', token);
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
      console.log('WsJwtStrategy: Token in socket.handshake.auth was invalid (empty or not a string).');
    } else {
      console.log('WsJwtStrategy: socket.handshake.auth or socket.handshake.auth.token is missing.');
      console.log('WsJwtStrategy: socket.handshake.auth value:', socket.handshake?.auth);
    }

    // Then try authorization header
    console.log('WsJwtStrategy: Checking socket.handshake.headers.authorization...');
    if (socket.handshake?.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      console.log('WsJwtStrategy: Found authorization header:', authHeader);
      const [type, tokenValue] = authHeader.split(' ');
      if (type?.toLowerCase() === 'bearer' && tokenValue?.length > 0) {
        return tokenValue;
      }
      console.log('WsJwtStrategy: Authorization header was not a valid bearer token.');
    } else {
      console.log('WsJwtStrategy: socket.handshake.headers or socket.handshake.headers.authorization is missing.');
      console.log('WsJwtStrategy: socket.handshake.headers value:', socket.handshake?.headers);
    }

    // Finally check query parameters
    console.log('WsJwtStrategy: Checking socket.handshake.query.token...');
    if (socket.handshake?.query?.token) {
      const token = socket.handshake.query.token;
      console.log('WsJwtStrategy: Found token in socket.handshake.query:', token);
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
      console.log('WsJwtStrategy: Token in socket.handshake.query was invalid (empty or not a string).');
    } else {
      console.log('WsJwtStrategy: socket.handshake.query or socket.handshake.query.token is missing.');
      console.log('WsJwtStrategy: socket.handshake.query value:', socket.handshake?.query);
    }
    
    console.warn('WsJwtStrategy: No valid authentication token found after checking all sources.');
    return null; // Explicitly return null if no token found
  } catch (error) {
    console.error('WsJwtStrategy: Error during token extraction process:', error instanceof Error ? error.message : 'Unknown error', error);
    return null;
  }
};

@Injectable()
export class WsJwtStrategy extends PassportStrategy(Strategy, 'ws-jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: (req: any): string | null => {
        try {
          console.log('WsJwtStrategy: jwtFromRequest called. Validating if req is a socket.');
          // req is the socket client instance passed from WsJwtAuthGuard's getRequest
          // Check if it looks like a Socket.IO client object
          if (req && typeof req.handshake === 'object' && typeof req.on === 'function') {
            console.log('WsJwtStrategy: req is a valid socket. Calling extractTokenFromSocket.');
            const token = extractTokenFromSocket(req as Socket); // Cast to Socket for extractTokenFromSocket
            if (token === null) {
                // This log is crucial.
                console.warn('WsJwtStrategy: extractTokenFromSocket returned null. Passport-JWT will likely attempt its default extraction mechanisms, which might fail for WebSockets if handshake.headers is not what it expects.');
            } else {
                console.log('WsJwtStrategy: extractTokenFromSocket returned a token.');
            }
            return token;
          }
          
          // If it's not a recognizable socket object, log and return null.
          // This prevents passport-jwt from trying its default header extraction on an incompatible object.
          console.warn(
            'WsJwtStrategy: jwtFromRequest called with an object that does not appear to be a Socket.IO client. Type:',
             typeof req,
             'Object keys:', Object.keys(req || {}).join(', ')
            );
          return null;
        } catch (error) {
          console.error('WsJwtStrategy: Unhandled error in jwtFromRequest:', error);
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
