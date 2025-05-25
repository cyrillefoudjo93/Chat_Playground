import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { AIProvidersModule } from '../ai-providers/ai-providers.module';
import { AuditLoggingModule } from '../audit-logging/audit-logging.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';
import { ConnectionManager } from './services/connection-manager.service';
import { StatsManager } from './services/stats-manager.service';

@Module({
  imports: [
    AuthModule,
    AIProvidersModule,
    AuditLoggingModule,
    RateLimitingModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.development', '.env'],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'test-secret',
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatGateway, ConnectionManager, StatsManager],
  exports: [ChatGateway],
})
export class GatewaysModule {}
