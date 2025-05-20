import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogService } from './services/audit-log.service';

@Module({
  imports: [ConfigModule],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLoggingModule {}
