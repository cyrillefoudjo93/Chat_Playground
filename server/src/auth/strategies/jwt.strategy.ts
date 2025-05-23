import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    // Validate the user exists and is active
    const user = await this.authService.validateUser(payload);
    
    if (!user) {
      return null;
    }

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
