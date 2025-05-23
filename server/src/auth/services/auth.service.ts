import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthStatusDto } from '../dto/auth.dto';

export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  picture?: string;
  roles?: string[];
  provider?: string;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      roles: user.roles || [],
      provider: user.provider || 'local',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN') || '12h',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
      },
    );

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET') || this.configService.get('JWT_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Here you would typically fetch the user from database
      // For now, we'll create a minimal user object
      const user: User = {
        id: payload.sub,
        username: `user-${payload.sub}`,
        email: `${payload.sub}@example.com`,
        roles: [],
      };

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async validateUser(payload: any): Promise<User | null> {
    // Here you would typically validate against a database
    // For now, we'll return the payload as a user
    if (!payload.sub) {
      return null;
    }

    return {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
      name: payload.name,
      roles: payload.roles || [],
      provider: payload.provider || 'local',
    };
  }

  async getAuthStatus(user: User): Promise<AuthStatusDto> {
    const { accessToken, refreshToken } = await this.generateTokens(user);
    
    // Calculate expiration time
    const expiresIn = this.configService.get('JWT_EXPIRES_IN') || '12h';
    const expiresAt = new Date();
    
    // Parse expires in (e.g., "12h", "1d", "60s")
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (match) {
      const [, amount, unit] = match;
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      expiresAt.setTime(expiresAt.getTime() + parseInt(amount) * multipliers[unit as keyof typeof multipliers]);
    } else {
      // Default to 12 hours
      expiresAt.setTime(expiresAt.getTime() + 12 * 3600000);
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        picture: user.picture,
        roles: user.roles,
      },
      token: accessToken,
      refreshToken,
      expiresAt,
    };
  }

  extractTokenFromAuthHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}
