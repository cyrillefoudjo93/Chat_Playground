import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConnectionState, ConnectionMetrics } from '../interfaces/connection-state.interface';
import { StatsManager } from './stats-manager.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  timeoutMs: number;
}

@Injectable()
export class ConnectionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionManager.name);
  private connections: Map<string, ConnectionState> = new Map();
  private server: Server;
  private readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    backoffMs: 1000,
    timeoutMs: 5000,
  };

  constructor(
    private readonly statsManager: StatsManager,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.initializePeriodicCleanup();
    this.logger.log('ConnectionManager initialized');
  }

  onModuleDestroy() {
    this.clearConnections();
  }

  setServer(server: Server) {
    this.server = server;
  }

  async handleConnection(client: Socket): Promise<boolean> {
    try {
      // Try different ways to extract the token
      let token: string | null = null;
      
      // First check handshake auth token
      if (client.handshake?.auth?.token) {
        token = String(client.handshake.auth.token);
      } 
      // Then try authorization header
      else if (client.handshake?.headers?.authorization) {
        const authHeader = client.handshake.headers.authorization;
        const [type, authToken] = authHeader.split(' ');
        if (type?.toLowerCase() === 'bearer' && authToken) {
          token = String(authToken);
        }
      }
      // Finally check query parameters
      else if (client.handshake?.query?.token) {
        const queryToken = client.handshake.query.token;
        // Convert from string array if necessary (happens in some socket.io implementations)
        if (Array.isArray(queryToken)) {
          token = String(queryToken[0]);
        } else if (queryToken) {
          token = String(queryToken);
        }
      }
      
      if (!token) {
        this.logger.warn(`No authentication token found for client ${client.id}`);
        client.emit('error', { message: 'Authentication required' });
        return false;
      }

      // Verify and decode token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET') || 'test-secret',
      }).catch(err => {
        this.logger.warn(`Token verification failed: ${err.message}`);
        client.emit('error', { 
          message: 'Authentication failed', 
          details: 'Invalid or expired token'
        });
        return null;
      });

      if (!payload || !payload.sub) {
        this.logger.warn(`Invalid token payload for client ${client.id}`);
        client.emit('error', { message: 'Invalid authentication token' });
        return false;
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        this.logger.warn(`Expired token for client ${client.id}`);
        client.emit('error', { message: 'Token has expired' });
        return false;
      }

      // Store connection state
      const connectionState: ConnectionState = {
        socket: client,
        userId: payload.sub,
        username: payload.username || `user-${payload.sub}`,
        lastHeartbeat: Date.now(),
        rooms: new Set(),
        messageQueue: [],
        status: 'connected',
        connectedAt: new Date().toISOString(),
        metadata: {
          userAgent: client.handshake.headers['user-agent'] || 'unknown',
          ip: client.handshake.address || 'unknown',
          transport: client.conn.transport.name,
          tokenExp: payload.exp
        }
      };

      this.connections.set(client.id, connectionState);
      this.statsManager.incrementConnectedUsers();
      this.logger.log(`Client ${client.id} (${connectionState.username}) connected successfully`);
      
      // Inform client of successful connection
      client.emit('connected', { 
        userId: connectionState.userId, 
        username: connectionState.username 
      });
      
      return true;

    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}: ${error.message}`);
      return false;
    }
  }

  handleDisconnection(client: Socket, reason?: string) {
    try {
      const connection = this.connections.get(client.id);
      if (connection) {
        connection.status = 'disconnected';
        connection.disconnectedAt = new Date().toISOString();
        this.statsManager.decrementConnectedUsers();
        
        // Log the disconnection with reason
        this.logger.log(`Client ${client.id} (${connection.username}) disconnected. Reason: ${reason || 'unknown'}`);
        
        // Process any pending messages in the queue before cleaning up
        if (connection.messageQueue.length > 0) {
          this.logger.debug(`Processing ${connection.messageQueue.length} pending messages for disconnected client ${client.id}`);
          this.processPendingMessages(client.id);
        }
        
        // Clean up room states and notify other users in the rooms
        connection.rooms.forEach(roomId => {
          this.leaveRoom(client.id, roomId);
          
          // Notify other users in the room about the disconnection
          this.server.to(roomId).emit('userLeft', {
            roomId,
            userId: connection.userId,
            username: connection.username,
            timestamp: new Date().toISOString(),
            reason: reason || 'user disconnected'
          });
        });
        
        // Keep the connection data for some time before removing it completely
        // This allows for potential reconnection and analytics
        setTimeout(() => {
          const connectionState = this.connections.get(client.id);
          if (this.connections.has(client.id) && 
              connectionState && connectionState.status === 'disconnected') {
            this.connections.delete(client.id);
            this.logger.debug(`Removed stale connection data for client ${client.id}`);
          }
        }, 5 * 60 * 1000); // Keep disconnected connection data for 5 minutes
      }
      return true;
    } catch (error) {
      this.logger.error(`Disconnection error for client ${client.id}: ${error.message}`);
      return false;
    }
  }

  async sendMessageWithRetry(
    socket: Socket,
    event: string,
    data: any,
    messageId: string,
  ): Promise<boolean> {
    const connection = this.connections.get(socket.id);
    if (!connection) {
      this.logger.warn(`No connection found for socket ${socket.id}`);
      return false;
    }

    // Add to message queue
    connection.messageQueue.push({
      id: messageId,
      event,
      data,
      timestamp: new Date(),
      attempts: 0,
    });

    let retries = 0;
    while (retries < this.retryConfig.maxRetries) {
      try {
        const success = await this.sendMessageWithTimeout(socket, event, data, messageId);
        if (success) {
          // Remove from queue on success
          connection.messageQueue = connection.messageQueue.filter(msg => msg.id !== messageId);
          this.statsManager.recordDeliverySuccess();
          return true;
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, this.retryConfig.backoffMs * Math.pow(2, retries))
        );
        retries++;
      } catch (error) {
        this.logger.error(
          `Attempt ${retries + 1} failed for message ${messageId}: ${error.message}`,
          error.stack
        );
        retries++;
      }
    }

    this.statsManager.recordDeliveryFailure();
    return false;
  }

  private async sendMessageWithTimeout(
    socket: Socket,
    event: string,
    data: any,
    messageId: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.logger.warn(`Message ${messageId} timed out`);
        resolve(false);
      }, this.retryConfig.timeoutMs);

      socket.emit(event, data, (ack: any) => {
        clearTimeout(timeoutId);
        resolve(ack?.received === true);
      });
    });
  }

  joinRoom(clientId: string, roomId: string) {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.rooms.add(roomId);
      this.statsManager.incrementRoomCount();
    }
  }

  leaveRoom(clientId: string, roomId: string) {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.rooms.delete(roomId);
      this.statsManager.decrementRoomCount();
    }
  }

  getConnectionMetrics(): ConnectionMetrics {
    const now = Date.now();
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected');
    
    return {
      connectedUsers: activeConnections.length,
      totalRooms: Array.from(this.connections.values())
        .reduce((total, conn) => total + conn.rooms.size, 0),
      messagesPerSecond: this.calculateMessageRate(),
      averageLatency: this.calculateAverageLatency(),
      messageQueueSize: this.getTotalQueueSize(),
      activeUsers: activeConnections.filter(conn => 
        now - conn.lastHeartbeat < 60000 // Active in last minute
      ).length,
    };
  }

  private calculateMessageRate(): number {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    return Array.from(this.connections.values())
      .reduce((total, conn) => 
        total + conn.messageQueue.filter(msg => 
          msg.timestamp.getTime() > oneSecondAgo
        ).length
      , 0);
  }

  private calculateAverageLatency(): number {
    // Implementation would depend on how you track message latency
    return 0; // Placeholder
  }

  private getTotalQueueSize(): number {
    return Array.from(this.connections.values())
      .reduce((total, conn) => total + conn.messageQueue.length, 0);
  }

  private initializePeriodicCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [clientId, connection] of this.connections.entries()) {
        // Clean up disconnected clients after 5 minutes
        if (connection.status === 'disconnected' && connection.disconnectedAt) {
          // Convert disconnectedAt from ISO string to timestamp
          const disconnectTime = new Date(connection.disconnectedAt).getTime();
          if (now - disconnectTime > 5 * 60 * 1000) {
            this.connections.delete(clientId);
            this.logger.debug(`Removed stale connection data for client ${clientId}`);
          }
        }
      }
    }, 60000); // Run cleanup every minute
  }

  private clearConnections() {
    for (const [clientId, connection] of this.connections.entries()) {
      if (connection.socket.connected) {
        connection.socket.disconnect(true);
      }
      this.connections.delete(clientId);
    }
  }

  private processPendingMessages(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection || connection.messageQueue.length === 0) {
      return;
    }

    // Process each message in the queue
    const pendingMessages = [...connection.messageQueue];
    connection.messageQueue = [];

    this.logger.debug(`Processing ${pendingMessages.length} pending messages for client ${clientId}`);
    
    pendingMessages.forEach(message => {
      try {
        // For messages that should persist even when user is offline
        // Store in database or send to a message broker for later delivery
        this.logger.debug(`Processing queued message ${message.id} (${message.event})`);
        
        // Different handling based on message type
        switch (message.event) {
          case 'chat':
            // Store chat messages for offline delivery
            this.storeOfflineMessage(connection.userId, message);
            break;
          
          case 'notification':
            // Store important notifications
            this.storeOfflineMessage(connection.userId, message);
            break;
            
          default:
            // For messages that don't need persistence, we can log or discard
            this.logger.debug(`Discarding non-persistent message ${message.id} (${message.event})`);
            this.statsManager.recordDeliveryFailure();
            break;
        }
      } catch (error) {
        this.logger.error(`Error processing queued message ${message.id}: ${error.message}`);
        this.statsManager.recordDeliveryFailure();
      }
    });
  }

  private storeOfflineMessage(userId: string, message: any): void {
    // This would typically store messages in a database
    // For now we'll just log that we would store it
    this.logger.debug(`Would store offline message for user ${userId}: ${JSON.stringify(message)}`);
    
    // In a real implementation:
    // this.messageRepository.saveOfflineMessage({
    //   userId,
    //   messageId: message.id,
    //   event: message.event,
    //   data: message.data,
    //   timestamp: message.timestamp,
    // });
  }
}
