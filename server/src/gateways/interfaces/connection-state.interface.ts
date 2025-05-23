import { Socket } from 'socket.io';

export interface ConnectionState {
  socket: Socket;
  userId: string;
  username: string;
  lastHeartbeat: number;
  rooms: Set<string>;
  messageQueue: {
    id: string;
    event: string;
    data: any;
    timestamp: Date;
    attempts: number;
  }[];
  connectedAt?: string;
  disconnectedAt?: string;
  status: 'connected' | 'disconnected';
  metadata?: {
    userAgent?: string;
    ip?: string;
    transport?: string;
    tokenExp?: number;
    lastActivity?: string;
    [key: string]: any;
  };
}

export interface ConnectionMetrics {
  connectedUsers: number;
  totalRooms: number;
  messagesPerSecond: number;
  averageLatency: number;
  messageQueueSize: number;
  activeUsers: number;
}
