import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard'; // Ensure WsJwtAuthGuard is imported
import { ThrottlerGuard } from '@nestjs/throttler';
import { WebSocketRateLimitGuard } from '../rate-limiting/guards/websocket-rate-limit.guard';
import { AuditLogService } from '../audit-logging/services/audit-log.service';
import { AuditEventType, AuditEventStatus } from '../audit-logging/interfaces/audit-log.interface';
import { AIOrchestrationService } from '../ai-providers/services/ai-orchestration.service';
import { AIChatMessage } from '../ai-providers/interfaces/ai-provider.interface';
import { ConnectionManager } from './services/connection-manager.service';
import { StatsManager } from './services/stats-manager.service';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  },
  namespace: 'chat',
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
})
@UseGuards(WsJwtAuthGuard) // Apply WsJwtAuthGuard at the Gateway CLASS level
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  private readonly logger = new Logger(ChatGateway.name);
  @WebSocketServer() server: Server;
  private heartbeatIntervalMs = 30000;
  private disconnectTimeoutMs = 90000;
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly aiOrchestrationService: AIOrchestrationService,
    private readonly connectionManager: ConnectionManager,
    private readonly statsManager: StatsManager,
  ) {}

  afterInit(server: Server) {
    this.connectionManager.setServer(server);
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const authenticated = await this.connectionManager.handleConnection(client);
      if (!authenticated) {
        this.logger.warn(`Authentication failed for client ${client.id}`);
        client.disconnect();
        return;
      }

      this.logger.log(`Client connected: ${client.id}`);
      this.initializeHeartbeat(client);

    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    try {
      this.connectionManager.handleDisconnection(client);
      this.cleanupHeartbeat(client.id);
      this.logger.log(`Client disconnected: ${client.id}`);
    } catch (error) {
      this.logger.error(`Disconnection error: ${error.message}`, error.stack);
    }
  }

  private initializeHeartbeat(client: Socket) {
    const interval = setInterval(() => {
      client.emit('heartbeatRequest', { timestamp: Date.now() }, (response: any) => {
        if (!response) {
          this.logger.warn(`No heartbeat response from client ${client.id}`);
          if (!client.disconnected) {
            client.disconnect();
          }
        }
      });
    }, this.heartbeatIntervalMs);

    this.heartbeatIntervals.set(client.id, interval);

    // Set disconnect timeout
    const disconnectTimeout = setTimeout(() => {
      if (!client.disconnected) {
        this.logger.warn(`Disconnecting client ${client.id} due to missed heartbeats`);
        client.disconnect();
      }
    }, this.disconnectTimeoutMs);

    client.once('disconnect', () => {
      clearTimeout(disconnectTimeout);
    });
  }

  private cleanupHeartbeat(clientId: string) {
    const interval = this.heartbeatIntervals.get(clientId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(clientId);
    }
  }

  @SubscribeMessage('heartbeat') // No specific auth guard needed here if class level WsJwtAuthGuard is sufficient
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { timestamp: number },
  ) {
    try {
      const latency = Date.now() - data.timestamp;
      client.emit('heartbeatAck', { latency });
    } catch (error) {
      this.logger.error(`Heartbeat error: ${error.message}`, error.stack);
    }
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() message: any,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = client.data.user;
      const messageId = uuidv4();
      
      const newMessage = {
        id: messageId,
        ...message,
        user: {
          id: user.id,
          username: user.username,
        },
        timestamp: new Date(),
      };

      await this.auditLogService.log(
        AuditEventType.CHAT_MESSAGE_SEND,
        'send_message',
        `User ${user.username} sent a message in room ${message.roomId}`,
        AuditEventStatus.SUCCESS,
        user.id,
        { roomId: message.roomId, messageType: message.type, messageId },
      );

      const recipients = await this.server.in(message.roomId).allSockets();
      const deliveryPromises = Array.from(recipients)
        .map(socketId => {
          const socket = this.server.sockets.sockets.get(socketId);
          if (!socket) {
            this.logger.warn(`Socket ${socketId} not found, may have disconnected`);
            return null;
          }
          return this.connectionManager.sendMessageWithRetry(
            socket,
            'newMessage',
            newMessage,
            messageId,
          );
        })
        .filter((promise): promise is Promise<boolean> => promise !== null);

      const deliveryResults = await Promise.all(deliveryPromises);
      const deliveredCount = deliveryResults.filter(success => success).length;

      if (deliveredCount === 0 && deliveryPromises.length > 0) {
        this.logger.warn(`Message ${messageId} not delivered to any recipients`);
        throw new WsException({
          status: 'error',
          message: 'Failed to deliver message to any recipients',
        });
      }

      this.statsManager.incrementTotalMessages();
      
      return { 
        success: true, 
        messageId, 
        message: newMessage,
        deliveredCount,
        totalRecipients: deliveryPromises.length,
      };

    } catch (error) {
      this.logger.error(`Message handling error: ${error.message}`, error.stack);
      throw new WsException({
        status: 'error',
        message: 'Failed to send message',
        details: error.message,
      });
    }
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody('roomId') roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(roomId);
    this.connectionManager.joinRoom(client.id, roomId);
    
    const user = client.data.user;
    this.server.to(roomId).emit('userJoined', {
      userId: user.id,
      username: user.username,
      timestamp: new Date(),
    });
    
    return { success: true };
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody('roomId') roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(roomId);
    this.connectionManager.leaveRoom(client.id, roomId);
    
    const user = client.data.user;
    this.server.to(roomId).emit('userLeft', {
      userId: user.id,
      username: user.username,
      timestamp: new Date(),
    });
    
    return { success: true };
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('startTyping')
  async handleStartTyping(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    client.to(data.roomId).emit('userTyping', {
      userId: user.id,
      username: user.username,
      isTyping: true,
    });
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    client.to(data.roomId).emit('userTyping', {
      userId: user.id,
      username: user.username,
      isTyping: false,
    });
  }

  // No specific auth guard needed here if class level WsJwtAuthGuard is sufficient
  // and if getStats is considered a non-sensitive operation post-connection
  @SubscribeMessage('getStats')
  handleGetStats(@ConnectedSocket() client: Socket) {
    return this.statsManager.getStats();
  }

  @UseGuards(WebSocketRateLimitGuard) // WsJwtAuthGuard is already applied at class level
  @SubscribeMessage('sendAiMessage')
  async handleAiMessage(
    @MessageBody() message: { text: string; model: string; roomId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = client.data.user;
      const messageId = uuidv4();
      
      // Parse provider:model format
      const [providerId, modelName] = message.model.includes(':') 
        ? message.model.split(':') 
        : ['gemini', 'gemini-pro']; // Default fallback
      
      const userMessage = {
        id: messageId,
        content: message.text,
        sender: 'user',
        user: {
          id: user.id,
          username: user.username,
        },
        timestamp: new Date(),
        roomId: message.roomId,
        isAIMessage: false,
      };

      // Emit user message first
      const roomId = message.roomId || 'general';
      this.server.to(roomId).emit('newMessage', userMessage);

      // Prepare AI response
      const aiMessageId = uuidv4();
      let aiResponseContent = '';

      const streamCallbacks = {
        onToken: (token: string) => {
          aiResponseContent += token;
          client.emit('aiToken', { token, messageId: aiMessageId });
        },
        onComplete: (fullResponse: string) => {
          const aiMessage = {
            id: aiMessageId,
            content: fullResponse,
            sender: 'ai',
            user: {
              id: 'ai',
              username: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} AI`,
            },
            timestamp: new Date(),
            roomId: message.roomId,
            isAIMessage: true,
            model: message.model,
          };
          
          this.server.to(roomId).emit('newMessage', aiMessage);
          client.emit('aiComplete', { response: fullResponse, messageId: aiMessageId });
        },
        onError: (error: Error) => {
          this.logger.error(`AI completion error: ${error.message}`, error.stack);
          client.emit('aiError', { error: error.message, messageId: aiMessageId });
        },
      };

      // Stream AI response
      await this.aiOrchestrationService.streamCompletion(
        providerId,
        modelName,
        [{ role: 'user', content: message.text }],
        streamCallbacks,
        { temperature: 0.7, maxTokens: 1000 }
      );

      return { success: true, messageId, aiMessageId };

    } catch (error) {
      this.logger.error(`AI message handling error: ${error.message}`, error.stack);
      throw new WsException({
        status: 'error',
        message: 'Failed to process AI message',
        error: error.message,
      });
    }
  }
}