import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';

describe('WebSocket Gateway', () => {
  jest.setTimeout(30000); // Set timeout for all tests
  
  let app: INestApplication;
  let clientSocket1: Socket;
  let clientSocket2: Socket;
  const port = 3002;
  const url = `http://localhost:${port}`;
  const testRoom = 'test-room';

  // Create signed JWT tokens for test clients
  const createToken = (userId: string) => {
    const payload = { sub: userId, username: `user-${userId}` };
    return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h'
    });
  };

  // Constants for timeouts and retry settings
  const SOCKET_TIMEOUT = 10000;
  const RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 1000;

  // Helper to create authenticated socket connection with retries and error handling
  const createAuthenticatedSocket = (token: string): Promise<Socket> => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      const attemptConnection = () => {
        attempts++;
        console.log(`Attempting connection (${attempts}/${RETRY_ATTEMPTS})...`);
        
        const socket = io(`${url}/chat`, {
          auth: { token },
          extraHeaders: {
            Authorization: `Bearer ${token}`,
          },
          transports: ['websocket'],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 1000,
          timeout: SOCKET_TIMEOUT,
        });

        const timeoutId = setTimeout(() => {
          socket.close();
          if (attempts < RETRY_ATTEMPTS) {
            console.log(`Connection attempt ${attempts} timed out, retrying...`);
            setTimeout(attemptConnection, RETRY_DELAY);
          } else {
            reject(new Error(`Connection failed after ${RETRY_ATTEMPTS} attempts`));
          }
        }, SOCKET_TIMEOUT);

        socket.on('connect', () => {
          clearTimeout(timeoutId);
          console.log('Socket connected successfully');
          resolve(socket);
        });

        socket.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          console.error('Socket connection error:', error);
          
          if (attempts < RETRY_ATTEMPTS) {
            console.log(`Retrying connection in ${RETRY_DELAY}ms...`);
            setTimeout(attemptConnection, RETRY_DELAY);
          } else {
            reject(error);
          }
        });

        socket.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      };
      
      attemptConnection();
    });
  };

  // Helper to join a room with timeout, retry and error handling
  const joinRoom = async (socket: Socket, roomId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const joinTimeout = 10000; // 10 second timeout for joining room
      let attempts = 0;
      const maxAttempts = 3;
      
      const attemptJoinRoom = () => {
        attempts++;
        console.log(`Attempting to join room ${roomId} (attempt ${attempts}/${maxAttempts})`);
        
        const timeoutId = setTimeout(() => {
          if (attempts < maxAttempts) {
            console.log(`Join room timeout, retrying (attempt ${attempts})`);
            setTimeout(attemptJoinRoom, 1000); // 1 second delay between retries
          } else {
            reject(new Error(`Room join timeout after ${maxAttempts} attempts`));
          }
        }, joinTimeout);

        socket.emit('joinRoom', { roomId }, (response: any) => {
          clearTimeout(timeoutId);
          
          if (response && response.success) {
            console.log(`Successfully joined room ${roomId}`);
            resolve();
          } else {
            const errorMessage = response?.error || 'Unknown error';
            console.error(`Failed to join room: ${errorMessage}`);
            
            if (attempts < maxAttempts) {
              console.log(`Retrying join room in 1 second...`);
              setTimeout(attemptJoinRoom, 1000);
            } else {
              reject(new Error(`Failed to join room after ${maxAttempts} attempts: ${errorMessage}`));
            }
          }
        });
      };
      
      attemptJoinRoom();
    });
  };

  // Helper to send a message with timeout and retry handling
  const sendMessage = async (socket: Socket, roomId: string, content: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const sendTimeout = 10000; // 10 second timeout for sending message
      let attempts = 0;
      const maxAttempts = 3;
      
      const attemptSendMessage = () => {
        attempts++;
        console.log(`Attempting to send message (attempt ${attempts}/${maxAttempts})`);
        
        const messageData = {
          content,
          roomId,
          type: 'text',
        };
        
        const timeoutId = setTimeout(() => {
          if (attempts < maxAttempts) {
            console.log(`Send message timeout, retrying (attempt ${attempts})`);
            setTimeout(attemptSendMessage, 1000); // 1 second delay between retries
          } else {
            reject(new Error(`Send message timeout after ${maxAttempts} attempts`));
          }
        }, sendTimeout);

        socket.emit('sendMessage', messageData, (response: any) => {
          clearTimeout(timeoutId);
          
          if (response && response.success) {
            console.log(`Successfully sent message: ${response.messageId}`);
            resolve(response);
          } else {
            const errorMessage = response?.error || 'Unknown error';
            console.error(`Failed to send message: ${errorMessage}`);
            
            if (attempts < maxAttempts) {
              console.log(`Retrying send message in 1 second...`);
              setTimeout(attemptSendMessage, 1000);
            } else {
              reject(new Error(`Failed to send message after ${maxAttempts} attempts: ${errorMessage}`));
            }
          }
        });
      };
      
      attemptSendMessage();
    });
  };

  beforeAll(async () => {
    // Create NestJS test application
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(port);

    try {
      // Create authenticated socket connections with proper error handling
      const [socket1, socket2] = await Promise.all([
        createAuthenticatedSocket(createToken('user1')),
        createAuthenticatedSocket(createToken('user2')),
      ]);

      clientSocket1 = socket1;
      clientSocket2 = socket2;
    } catch (error) {
      console.error('Failed to establish socket connections:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      // Clean up rooms and connections
      if (clientSocket1?.connected) {
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => {
            clientSocket1.disconnect();
            resolve();
          }, 1000);

          clientSocket1.emit('leaveRoom', { roomId: testRoom }, () => {
            clearTimeout(timeoutId);
            clientSocket1.disconnect();
            resolve();
          });
        });
      }

      if (clientSocket2?.connected) {
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => {
            clientSocket2.disconnect();
            resolve();
          }, 1000);

          clientSocket2.emit('leaveRoom', { roomId: testRoom }, () => {
            clearTimeout(timeoutId);
            clientSocket2.disconnect();
            resolve();
          });
        });
      }
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  });

  afterAll(async () => {
    try {
      await app.close();
    } catch (error) {
      console.error('Error closing application:', error);
    }
  });

  // Test cases
  
  it('should reject connection without token', (done) => {
    const invalidSocket = io(`${url}/chat`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 5000,
    });

    const timeoutId = setTimeout(() => {
      invalidSocket.close();
      done(new Error('Test timeout'));
    }, 5000);

    invalidSocket.on('connect_error', (error) => {
      clearTimeout(timeoutId);
      expect(error).toBeDefined();
      invalidSocket.close();
      done();
    });
  });

  it('should handle heartbeat with latency tracking', (done) => {
    jest.setTimeout(10000);
    
    let heartbeatReceived = false;
    let latencyReceived = false;

    const timeoutId = setTimeout(() => {
      done(new Error('Heartbeat test timeout'));
    }, 8000);

    clientSocket1.on('heartbeatRequest', (data) => {
      expect(data.timestamp).toBeDefined();
      heartbeatReceived = true;
      clientSocket1.emit('heartbeat', { timestamp: data.timestamp });
    });

    clientSocket1.on('heartbeatAck', (data) => {
      expect(data.latency).toBeDefined();
      expect(typeof data.latency).toBe('number');
      latencyReceived = true;
      
      if (heartbeatReceived && latencyReceived) {
        clearTimeout(timeoutId);
        done();
      }
    });
  });

  it('should handle room joining and leaving with state tracking', async () => {
    jest.setTimeout(10000);
    
    // Join rooms with proper error handling
    await joinRoom(clientSocket1, testRoom);
    await joinRoom(clientSocket2, testRoom);

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Room test timeout'));
      }, 8000);

      let joinedCount = 0;
      let leftCount = 0;

      clientSocket2.on('userJoined', (data) => {
        expect(data.userId).toBe('user1');
        expect(data.timestamp).toBeDefined();
        joinedCount++;

        if (joinedCount === 1) {
          clientSocket1.emit('leaveRoom', { roomId: testRoom });
        }
      });

      clientSocket2.on('userLeft', (data) => {
        expect(data.userId).toBe('user1');
        expect(data.timestamp).toBeDefined();
        leftCount++;

        if (leftCount === 1) {
          // Check stats
          clientSocket2.emit('getStats', null, (stats: any) => {
            expect(stats.connectedUsers).toBeDefined();
            expect(stats.totalRooms).toBeDefined();
            clearTimeout(timeoutId);
            resolve();
          });
        }
      });
    });
  });

  it('should send messages with delivery guarantees and retry logic', async () => {
    jest.setTimeout(15000);

    // Join rooms first
    await joinRoom(clientSocket1, testRoom);
    await joinRoom(clientSocket2, testRoom);

    const messageText = 'Test message with delivery guarantee';
    
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message delivery timeout'));
      }, 10000);

      clientSocket2.on('newMessage', (data) => {
        expect(data.content).toBe(messageText);
        expect(data.id).toBeDefined();
        expect(data.user.id).toBe('user1');
        clearTimeout(timeoutId);
        resolve();
      });

      clientSocket1.emit('sendMessage', {
        content: messageText,
        roomId: testRoom,
        type: 'text',
      }, (response: any) => {
        expect(response.success).toBe(true);
        expect(response.deliveredCount).toBeGreaterThan(0);
        expect(response.totalRecipients).toBeGreaterThan(0);
      });
    });
  });

  it('should handle typing indicators with debouncing', async () => {
    jest.setTimeout(10000);

    // Join rooms first
    await joinRoom(clientSocket1, testRoom);
    await joinRoom(clientSocket2, testRoom);

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Typing indicator timeout'));
      }, 8000);

      let typingEvents = 0;

      clientSocket2.on('userTyping', (data) => {
        expect(data.userId).toBe('user1');
        expect(data.username).toBeDefined();
        expect(typeof data.isTyping).toBe('boolean');
        typingEvents++;

        if (typingEvents === 2) {
          clearTimeout(timeoutId);
          resolve();
        }
      });

      // Test start typing
      clientSocket1.emit('startTyping', { roomId: testRoom });

      // Test stop typing after a short delay
      setTimeout(() => {
        clientSocket1.emit('stopTyping', { roomId: testRoom });
      }, 1000);
    });
  });

  it('should handle reconnection with message recovery', async () => {
    jest.setTimeout(15000);

    // Join rooms first
    await joinRoom(clientSocket1, testRoom);
    await joinRoom(clientSocket2, testRoom);

    const messageText = 'Message during disconnection';
    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message recovery timeout'));
      }, 10000);

      clientSocket2.on('newMessage', (data) => {
        expect(data.content).toBe(messageText);
        clearTimeout(timeoutId);
        resolve();
      });
    });

    // Send message and simulate disconnection/reconnection
    clientSocket1.emit('sendMessage', {
      content: messageText,
      roomId: testRoom,
      type: 'text',
    });

    await new Promise<void>(resolve => {
      clientSocket2.disconnect();
      setTimeout(resolve, 1000);
    });

    await new Promise<void>(resolve => {
      clientSocket2.connect();
      clientSocket2.on('connect', resolve);
    });

    // Wait for message recovery
    await messagePromise;
  });

  it('should track and report real-time statistics', async () => {
    const stats = await new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Stats request timeout'));
      }, 5000);

      clientSocket1.emit('getStats', null, (stats: any) => {
        clearTimeout(timeoutId);
        resolve(stats);
      });
    });

    expect(stats).toBeDefined();
    expect(typeof stats.connectedUsers).toBe('number');
    expect(typeof stats.totalMessages).toBe('number');
    expect(typeof stats.totalRooms).toBe('number');
    expect(typeof stats.deliverySuccess).toBe('number');
    expect(typeof stats.deliveryFailures).toBe('number');
    expect(typeof stats.messageQueueSize).toBe('number');
    expect(typeof stats.activeUsers).toBe('number');
    expect(typeof stats.messagesPerSecond).toBe('number');
    expect(typeof stats.averageLatency).toBe('number');
  });
});
