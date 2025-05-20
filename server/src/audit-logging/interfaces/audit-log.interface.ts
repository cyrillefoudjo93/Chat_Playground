export enum AuditEventType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  AI_REQUEST = 'AI_REQUEST',
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  DOCUMENT_DELETE = 'DOCUMENT_DELETE',
  CHAT_MESSAGE_SEND = 'CHAT_MESSAGE_SEND',
  ADMIN_ACTION = 'ADMIN_ACTION',
  DATA_EXPORT = 'DATA_EXPORT',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
}

export enum AuditEventStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  WARNING = 'WARNING',
}

export interface AuditLogEntry {
  id: string;
  eventType: AuditEventType;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  resourceId?: string;
  resourceType?: string;
  action: string;
  description: string;
  status: AuditEventStatus;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface AuditLogOptions {
  skipPII?: boolean;
  masked?: string[];
}
