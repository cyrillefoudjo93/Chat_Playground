import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AuditEventType,
  AuditEventStatus,
  AuditLogEntry,
  AuditLogOptions,
} from '../interfaces/audit-log.interface';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly logsDir: string;
  private readonly isGdprCompliant: boolean;
  private readonly retentionPeriodDays: number;
  
  constructor(private configService: ConfigService) {
    this.logsDir = this.configService.get<string>('AUDIT_LOGS_PATH', './logs/audit');
    this.isGdprCompliant = this.configService.get<boolean>('GDPR_COMPLIANCE', true);
    this.retentionPeriodDays = this.configService.get<number>('AUDIT_LOG_RETENTION_DAYS', 90);
    
    // Ensure log directory exists
    this.ensureLogDirectory();
  }
  
  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    action: string,
    description: string,
    status: AuditEventStatus,
    userId?: string,
    metadata?: Record<string, any>,
    options?: AuditLogOptions,
  ): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: uuidv4(),
      eventType,
      userId,
      action,
      description,
      status,
      metadata: this.sanitizeMetadata(metadata, options),
      timestamp: new Date(),
    };
    
    try {
      await this.saveLogEntry(logEntry);
      return logEntry;
    } catch (error) {
      this.logger.error(`Failed to save audit log entry: ${error.message}`, error.stack);
      // Continue execution even if logging fails
      return logEntry;
    }
  }
  
  /**
   * Clean up old audit logs according to retention policy
   */
  async cleanupOldLogs(): Promise<number> {
    try {
      const files = await fs.readdir(this.logsDir);
      const now = new Date();
      let deletedCount = 0;
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);
        const fileAge = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (fileAge > this.retentionPeriodDays) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to clean up old logs: ${error.message}`, error.stack);
      return 0;
    }
  }
  
  /**
   * Export audit logs for a specific date range
   */
  async exportLogs(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    try {
      const files = await fs.readdir(this.logsDir);
      let allLogs: AuditLogEntry[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logsDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const logs: AuditLogEntry[] = fileContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        
        // Filter logs by date range
        const filteredLogs = logs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= startDate && logDate <= endDate;
        });
        
        allLogs = [...allLogs, ...filteredLogs];
      }
      
      return allLogs;
    } catch (error) {
      this.logger.error(`Failed to export logs: ${error.message}`, error.stack);
      return [];
    }
  }
  
  /**
   * Search for specific audit log entries
   */
  async searchLogs(
    criteria: {
      userId?: string;
      eventType?: AuditEventType;
      status?: AuditEventStatus;
      startDate?: Date;
      endDate?: Date;
      action?: string;
    },
    page = 1,
    limit = 50,
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    try {
      const files = await fs.readdir(this.logsDir);
      let allLogs: AuditLogEntry[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logsDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const logs: AuditLogEntry[] = fileContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        
        allLogs = [...allLogs, ...logs];
      }
      
      // Apply filters
      let filteredLogs = allLogs;
      
      if (criteria.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === criteria.userId);
      }
      
      if (criteria.eventType) {
        filteredLogs = filteredLogs.filter(log => log.eventType === criteria.eventType);
      }
      
      if (criteria.status) {
        filteredLogs = filteredLogs.filter(log => log.status === criteria.status);
      }
      
      if (criteria.action) {
        const searchAction = criteria.action;
        filteredLogs = filteredLogs.filter(log => typeof log.action === 'string' && log.action.includes(searchAction));
      }
      
      if (criteria.startDate) {
        const start = new Date(criteria.startDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= start);
      }
      
      if (criteria.endDate) {
        const end = new Date(criteria.endDate);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= end);
      }
      
      // Sort by timestamp (descending)
      filteredLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      // Paginate
      const start = (page - 1) * limit;
      const paginatedLogs = filteredLogs.slice(start, start + limit);
      
      return {
        logs: paginatedLogs,
        total: filteredLogs.length,
      };
    } catch (error) {
      this.logger.error(`Failed to search logs: ${error.message}`, error.stack);
      return { logs: [], total: 0 };
    }
  }
  
  // Private Methods
  
  /**
   * Sanitize metadata for GDPR compliance
   */
  private sanitizeMetadata(
    metadata?: Record<string, any>,
    options?: AuditLogOptions,
  ): Record<string, any> | undefined {
    if (!metadata) return undefined;
    
    // If GDPR compliance is enabled, sanitize sensitive data
    if (this.isGdprCompliant || options?.skipPII) {
      const sanitized = { ...metadata };
      const sensitiveFields = [
        'password', 'secret', 'token', 'key', 'auth',
        'credit', 'card', 'ssn', 'social', 'passport',
        'license', 'address', 'phone', 'dob', 'birth',
        ...(options?.masked || []),
      ];
      
      // Recursively sanitize objects
      const sanitizeObject = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        
        if (Array.isArray(obj)) {
          return obj.map(item => sanitizeObject(item));
        }
        
        const result: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(obj)) {
          // Check if the field name contains any sensitive keywords
          const isSensitive = sensitiveFields.some(field => 
            key.toLowerCase().includes(field.toLowerCase())
          );
          
          if (isSensitive) {
            result[key] = '[REDACTED]';
          } else if (typeof value === 'object' && value !== null) {
            result[key] = sanitizeObject(value);
          } else {
            result[key] = value;
          }
        }
        
        return result;
      };
      
      return sanitizeObject(sanitized);
    }
    
    return metadata;
  }
  
  /**
   * Save a log entry to the appropriate file
   */
  private async saveLogEntry(logEntry: AuditLogEntry): Promise<void> {
    const date = new Date(logEntry.timestamp);
    const fileName = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.log`;
    const filePath = path.join(this.logsDir, fileName);
    
    const logJson = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(filePath, logJson, 'utf8');
  }
  
  /**
   * Ensure the log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create log directory: ${error.message}`, error.stack);
    }
  }
}
