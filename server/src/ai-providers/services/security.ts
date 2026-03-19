import { Injectable, UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, MessageBody, ConnectedSocket, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// EU AI Act Compliance: Input Validation Service
// Article: General Best Practice (Security and Input Validation)
// Purpose: Validate and sanitize user input to prevent malicious content generation

@Injectable()
export class InputValidationService {
  // Maximum allowed message length per EU AI Act security guidelines
  private readonly MAX_MESSAGE_LENGTH = 10000;
  
  // Minimum allowed message length to prevent empty submissions
  private readonly MIN_MESSAGE_LENGTH = 1;
  
  // Pattern to detect potentially malicious content patterns
  private readonly MALICIOUS_PATTERN = /(<script|javascript:|onerror=|onclick=|eval\(|expression\()/gi;

  /**
   * Validates message content for security compliance
   * EU AI Act Article 50: Security and robustness requirements
   * 
   * @param content - The message content to validate
   * @throws WsException if validation fails
   * @returns Sanitized message content
   */
  validateMessageContent(content: unknown): string {
    // Type validation: ensure content is a string
    if (typeof content !== 'string') {
      throw new WsException('Invalid message content: must be a string');
    }

    // Null/undefined check
    if (!content || content.trim().length === 0) {
      throw new WsException('Invalid message content: cannot be empty');
    }

    // Length validation: prevent excessively long inputs
    if (content.length < this.MIN_MESSAGE_LENGTH) {
      throw new WsException(`Message must be at least ${this.MIN_MESSAGE_LENGTH} character(s)`);
    }

    if (content.length > this.MAX_MESSAGE_LENGTH) {
      throw new WsException(`Message exceeds maximum length of ${this.MAX_MESSAGE_LENGTH} characters`);
    }

    // Malicious pattern detection
    if (this.MALICIOUS_PATTERN.test(content)) {
      throw new WsException('Message contains potentially malicious content');
    }

    // Return trimmed content
    return content.trim();
  }

  /**
   * Validates sender metadata
   * 
   * @param senderId - The ID of the message sender
   * @throws WsException if validation fails
   */
  validateSenderId(senderId: unknown): void {
    if (typeof senderId !== 'string' || !senderId.trim()) {
      throw new WsException('Invalid sender ID');
    }
  }

  /**
   * Validates optional message metadata
   * 
   * @param metadata - Optional metadata object
   * @throws WsException if validation fails
   */
  validateMetadata(metadata: unknown): void {
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new WsException('Invalid message metadata: must be an object');
      }
    }
  }
}

// WebSocket Rate Limit Guard placeholder
// This guard should be implemented in the actual application
@UseGuards(class WebSocketRateLimitGuard {})
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class ChatGateway {
  constructor(private readonly inputValidationService: InputValidationService) {}

  /**
   * Handles incoming chat messages with EU AI Act compliance validation
   * Article: General Best Practice (Security and Input Validation)
   * 
   * @param message - The incoming message object
   * @param client - The connected WebSocket client
   */
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() message: any,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      // Extract user from client data
      const user = client.data.user;
      
      if (!user) {
        throw new WsException('User not authenticated');
      }

      // Generate unique message ID for tracking
      const messageId = uuidv4();

      // EU AI Act Article 50 & Security — Validate user input
      // Validate message content
      if (!message.content) {
        throw new WsException('Message content is required');
      }

      const validatedContent = this.inputValidationService.validateMessageContent(message.content);

      // Validate sender ID if provided
      if (message.senderId) {
        this.inputValidationService.validateSenderId(message.senderId);
      }

      // Validate optional metadata
      if (message.metadata) {
        this.inputValidationService.validateMetadata(message.metadata);
      }

      // Construct validated message object
      const validatedMessage = {
        id: messageId,
        content: validatedContent,
        senderId: message.senderId || user.id,
        timestamp: new Date().toISOString(),
        metadata: message.metadata || {},
      };

      // Emit validated message to connected clients
      client.emit('messageValidated', {
        success: true,
        messageId,
        message: validatedMessage,
      });

    } catch (error) {
      // Handle validation errors
      if (error instanceof WsException) {
        client.emit('validationError', {
          success: false,
          error: error.getError(),
        });
      } else {
        client.emit('validationError', {
          success: false,
          error: 'An unexpected error occurred during message validation',
        });
      }
    }
  }
}
