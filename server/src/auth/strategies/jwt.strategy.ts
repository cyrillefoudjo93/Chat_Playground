import { Injectable, Logger } from '@nestjs/common'; // Added Logger
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name); // Added logger instance

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: (req: any) => {
        this.logger.log('[JwtStrategy] jwtFromRequest invoked.');
        if (!req) {
          this.logger.warn('[JwtStrategy] Request object is null or undefined.');
          return null;
        }
        // Log keys of req to understand its structure, common for HTTP and WS upgrade requests
        this.logger.debug(`[JwtStrategy] Request object keys: ${Object.keys(req).join(', ')}`);

        if (req.headers) {
          this.logger.debug(`[JwtStrategy] req.headers.authorization: ${req.headers.authorization}`);
          if (typeof req.headers.authorization !== 'string') {
            this.logger.warn('[JwtStrategy] req.headers.authorization is not a string.');
          }
        } else {
          this.logger.warn('[JwtStrategy] req.headers is undefined.');
          // For WS, initial handshake might be an http.IncomingMessage
          // Log other potentially useful properties if headers are missing
          if (req.url) this.logger.debug(`[JwtStrategy] req.url: ${req.url}`);
          if (req.method) this.logger.debug(`[JwtStrategy] req.method: ${req.method}`);
          if (req.handshake) this.logger.debug(`[JwtStrategy] req.handshake keys: ${Object.keys(req.handshake).join(', ')}`);

        }
        
        // Original logic from ExtractJwt.fromAuthHeaderAsBearerToken()
        let token = null;
        if (req.headers && req.headers.authorization) {
          const parts = req.headers.authorization.split(' ');
          if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
            token = parts[1];
          } else {
            this.logger.warn('[JwtStrategy] Authorization header format is not Bearer token.');
          }
        } else {
          this.logger.warn('[JwtStrategy] No authorization header found or req.headers is missing.');
        }
        this.logger.debug(`[JwtStrategy] Token extracted: ${token ? 'A token was found' : 'No token found'}`);
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    this.logger.log(`[JwtStrategy] Validating payload: ${JSON.stringify(payload)}`);
    // Validate the user exists and is active
    const user = await this.authService.validateUser(payload);
    
    if (!user) {
      this.logger.warn('[JwtStrategy] User validation failed for payload.');
      return null;
    }
    this.logger.log(`[JwtStrategy] User validated: ${user.username}`);
    // The returned value will be injected into the request object
    return { 
      id: payload.sub, 
      username: payload.username,
      email: payload.email,
      name: payload.name,
      roles: payload.roles || [],
      provider: payload.provider || 'local',
    };
  }
}
