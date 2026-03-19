import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogService } from './services/audit-log.service';
import { AIComplianceAuditService } from './services/ai-compliance-audit.service';

@Module({
  imports: [ConfigModule],
  providers: [AuditLogService, AIComplianceAuditService],
  exports: [AuditLogService, AIComplianceAuditService],
})
export class AuditLoggingModule {}
