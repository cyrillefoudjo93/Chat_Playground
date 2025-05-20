import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuditLogService } from '../audit-logging/services/audit-log.service';
import { AuditEventType, AuditEventStatus } from '../audit-logging/interfaces/audit-log.interface';
import { AIOrchestrationService } from '../ai-providers/services/ai-orchestration.service';
import { AIChatMessage } from '../ai-providers/interfaces/ai-provider.interface';

@WebSocketGateway({
  cors: {
    origin: '*', // Configure this according to your frontend domains
  },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer() server: Server;
  
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly aiOrchestrationService: AIOrchestrationService,
  ) {}

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Verify authentication token
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      // In a real application, you'd verify the token here
      // For now, we'll just store the connection
      console.log(`Client connected: ${client.id}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Use JWT authentication and rate limiting for WebSocket connections
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() message: any,
    @ConnectedSocket() client: Socket,
  ) {
    // Access user from JWT token
    const user = client.data.user;
    
    // Create a new message with user info
    const newMessage = {
      ...message,
      user: {
        id: user.id,
        username: user.username,
      },
      timestamp: new Date(),
    };
    
    // Log the event
    await this.auditLogService.log(
      AuditEventType.CHAT_MESSAGE_SEND,
      'send_message',
      `User ${user.username} sent a message in room ${message.roomId}`,
      AuditEventStatus.SUCCESS,
      user.id,
      { roomId: message.roomId, messageType: message.type },
    );
    
    // Emit to all clients in the same room
    this.server.to(message.roomId).emit('newMessage', newMessage);
    
    return { success: true, message: newMessage };
  }

  @UseGuards(JwtAuthGuard)
  @SubscribeMessage('joinRoom')
  async joinRoom(
    @MessageBody('roomId') roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(roomId);
    
    // Notify others that a user joined
    const user = client.data.user;
    this.server.to(roomId).emit('userJoined', {
      userId: user.id,
      username: user.username,
      timestamp: new Date(),
    });
    
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @MessageBody('roomId') roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(roomId);
    
    // Notify others that a user left
    const user = client.data.user;
    this.server.to(roomId).emit('userLeft', {
      userId: user.id,
      username: user.username,
      timestamp: new Date(),
    });
    
    return { success: true };
  }
  
  @UseGuards(JwtAuthGuard)
  @SubscribeMessage('startTyping')
  async startTyping(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    
    // Broadcast to all users in the room except the sender
    client.to(data.roomId).emit('userTyping', {
      userId: user.id,
      username: user.username,
      isTyping: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @SubscribeMessage('stopTyping')
  async stopTyping(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    
    // Broadcast to all users in the room except the sender
    client.to(data.roomId).emit('userTyping', {
      userId: user.id,
      username: user.username,
      isTyping: false,
    });
  }
  
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @SubscribeMessage('requestAICompletion')
  async handleAICompletion(
    @MessageBody() data: { 
      prompt: string;
      providerId?: string;
      model?: string;
      options?: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    
    try {
      // Log the AI request
      await this.auditLogService.log(
        AuditEventType.AI_REQUEST,
        'ai_completion',
        `User ${user.username} requested AI completion`,
        AuditEventStatus.SUCCESS,
        user.id,
        { 
          providerId: data.providerId,
          model: data.model,
        },
      );
      
      // Stream tokens to the client
      const streamCallbacks = {
        onToken: (token: string) => {
          client.emit('aiToken', { token });
        },
        onComplete: (fullResponse: string) => {
          client.emit('aiComplete', { response: fullResponse });
        },
        onError: (error: Error) => {
          client.emit('aiError', { error: error.message });
        },
      };
      
      // Format the messages for the AI
      const messages: AIChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: data.prompt },
      ];
      
      // Use the specified provider or fallback
      if (data.providerId && data.model) {
        await this.aiOrchestrationService.streamCompletion(
          data.providerId,
          data.model,
          messages,
          streamCallbacks,
          data.options,
        );
      } else {
        // Use fallback strategy
        await this.aiOrchestrationService.streamCompletionWithFallback(
          messages,
          streamCallbacks,
          data.options,
        );
      }
      
      return { success: true };
    } catch (error) {
      // Log the error
      await this.auditLogService.log(
        AuditEventType.AI_REQUEST,
        'ai_completion',
        `AI request failed: ${error.message}`,
        AuditEventStatus.FAILURE,
        user.id,
      );
      
      client.emit('aiError', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}