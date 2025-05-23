import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WsJwtStrategy } from './strategies/ws-jwt.strategy';
import { OktaOAuth2Strategy } from './strategies/okta-oauth2.strategy';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    WsJwtStrategy,
    OktaOAuth2Strategy,
    AuthService,
    JwtAuthGuard,
    WsJwtAuthGuard,
  ],
  exports: [JwtModule, AuthService, JwtAuthGuard, WsJwtAuthGuard],
})
export class AuthModule {}
