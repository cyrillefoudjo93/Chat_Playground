import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AIProvidersModule } from './ai-providers/ai-providers.module';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';
import { AuditLoggingModule } from './audit-logging/audit-logging.module';
import { RateLimitingModule } from './rate-limiting/rate-limiting.module';
import { GatewaysModule } from './gateways/gateways.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    
    // Feature modules
    AuthModule,
    AIProvidersModule,
    DocumentIngestionModule,
    AuditLoggingModule,
    RateLimitingModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
