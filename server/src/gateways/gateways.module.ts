import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { AIProvidersModule } from '../ai-providers/ai-providers.module';
import { AuditLoggingModule } from '../audit-logging/audit-logging.module';

@Module({
  imports: [AuthModule, AIProvidersModule, AuditLoggingModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewaysModule {}
