import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import { RateLimitingModule } from '../rate-limiting.module';
import { WebSocketRateLimitGuard } from '../guards/websocket-rate-limit.guard';
import { AuthModule } from '../../auth/auth.module';
import { GatewaysModule } from '../../gateways/gateways.module';

describe('WebSocket Rate Limiting', () => {
  let app: INestApplication;
  let module: TestingModule;
  let clientSocket: Socket;
  let serverPort: number;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ThrottlerModule.forRoot([
          {
            name: 'websocket',
            ttl: 10000, // 10 seconds
            limit: 5,   // 5 messages per 10 seconds
          },
        ]),
        AuthModule,
        RateLimitingModule,
        GatewaysModule,
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    await app.listen(0);
    
    const server = app.getHttpServer();
    const address = server.address();
    serverPort = typeof address === 'string' ? parseInt(address) : address.port;
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await app.close();
    await module.close();
  });

  beforeEach((done) => {
    clientSocket = io(`http://localhost:${serverPort}/chat`, {
      transports: ['websocket'],
      auth: {
        token: 'valid-test-token', // Mock token for testing
      },
    });

    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  describe('WebSocket Message Rate Limiting', () => {
    it('should allow messages within rate limit', (done) => {
      let messageCount = 0;
      
      clientSocket.on('newMessage', () => {
        messageCount++;
        if (messageCount === 3) {
          expect(messageCount).toBe(3);
          done();
        }
      });

      // Send 3 messages (within limit of 5)
      for (let i = 0; i < 3; i++) {
        clientSocket.emit('sendMessage', {
          roomId: 'test-room',
          content: `Test message ${i}`,
          type: 'text',
        });
      }
    });

    it('should block messages when rate limit exceeded', (done) => {
      let messageCount = 0;
      let errorReceived = false;

      clientSocket.on('newMessage', () => {
        messageCount++;
      });

      clientSocket.on('error', (error) => {
        if (error.message && error.message.includes('rate limit')) {
          errorReceived = true;
          expect(messageCount).toBeLessThan(6); // Should not receive all 6 messages
          expect(errorReceived).toBe(true);
          done();
        }
      });

      // Send 6 messages (exceeds limit of 5)
      for (let i = 0; i < 6; i++) {
        clientSocket.emit('sendMessage', {
          roomId: 'test-room',
          content: `Test message ${i}`,
          type: 'text',
        });
      }

      // Set timeout in case error is not received
      setTimeout(() => {
        if (!errorReceived) {
          done(new Error('Expected rate limit error was not received'));
        }
      }, 2000);
    });

    it('should reset rate limit after TTL expires', (done) => {
      let firstBatchCount = 0;
      let secondBatchCount = 0;
      let errorReceived = false;

      clientSocket.on('newMessage', () => {
        if (!errorReceived) {
          firstBatchCount++;
        } else {
          secondBatchCount++;
        }
      });

      clientSocket.on('error', (error) => {
        if (error.message && error.message.includes('rate limit')) {
          errorReceived = true;
          expect(firstBatchCount).toBeLessThan(6);

          // Wait for TTL to expire (11 seconds for 10s TTL + buffer)
          setTimeout(() => {
            // Send messages again after TTL expires
            for (let i = 0; i < 3; i++) {
              clientSocket.emit('sendMessage', {
                roomId: 'test-room-2',
                content: `Reset test message ${i}`,
                type: 'text',
              });
            }

            // Check that messages are allowed again
            setTimeout(() => {
              expect(secondBatchCount).toBeGreaterThan(0);
              done();
            }, 1000);
          }, 11000);
        }
      });

      // Send messages to exceed rate limit
      for (let i = 0; i < 6; i++) {
        clientSocket.emit('sendMessage', {
          roomId: 'test-room',
          content: `Test message ${i}`,
          type: 'text',
        });
      }
    }, 15000); // Increase timeout for this test
  });

  describe('WebSocket Room Operations Rate Limiting', () => {
    it('should rate limit joinRoom events', (done) => {
      let joinSuccessCount = 0;
      let errorReceived = false;

      clientSocket.on('userJoined', () => {
        joinSuccessCount++;
      });

      clientSocket.on('error', (error) => {
        if (error.message && error.message.includes('rate limit')) {
          errorReceived = true;
          expect(joinSuccessCount).toBeLessThan(6);
          expect(errorReceived).toBe(true);
          done();
        }
      });

      // Attempt to join 6 rooms rapidly (should exceed rate limit)
      for (let i = 0; i < 6; i++) {
        clientSocket.emit('joinRoom', `test-room-${i}`);
      }

      setTimeout(() => {
        if (!errorReceived) {
          done(new Error('Expected rate limit error for joinRoom was not received'));
        }
      }, 2000);
    });

    it('should rate limit leaveRoom events', (done) => {
      let leaveSuccessCount = 0;
      let errorReceived = false;

      // First join some rooms
      for (let i = 0; i < 3; i++) {
        clientSocket.emit('joinRoom', `leave-test-room-${i}`);
      }

      setTimeout(() => {
        clientSocket.on('userLeft', () => {
          leaveSuccessCount++;
        });

        clientSocket.on('error', (error) => {
          if (error.message && error.message.includes('rate limit')) {
            errorReceived = true;
            expect(leaveSuccessCount).toBeLessThan(6);
            expect(errorReceived).toBe(true);
            done();
          }
        });

        // Attempt to leave 6 rooms rapidly (should exceed rate limit)
        for (let i = 0; i < 6; i++) {
          clientSocket.emit('leaveRoom', `leave-test-room-${i % 3}`);
        }

        setTimeout(() => {
          if (!errorReceived) {
            done(new Error('Expected rate limit error for leaveRoom was not received'));
          }
        }, 2000);
      }, 1000); // Wait for joins to complete
    });
  });

  describe('WebSocket Rate Limiting Bypass', () => {
    it('should bypass rate limiting for trusted connections', (done) => {
      // Create a client with trusted headers
      const trustedSocket = io(`http://localhost:${serverPort}/chat`, {
        transports: ['websocket'],
        auth: {
          token: 'valid-test-token',
        },
        extraHeaders: {
          'X-Internal-Service': 'true',
        },
      });

      let messageCount = 0;

      trustedSocket.on('connect', () => {
        trustedSocket.on('newMessage', () => {
          messageCount++;
          if (messageCount === 10) {
            expect(messageCount).toBe(10);
            trustedSocket.disconnect();
            done();
          }
        });

        // Send 10 messages (should exceed normal rate limit but be allowed for trusted service)
        for (let i = 0; i < 10; i++) {
          trustedSocket.emit('sendMessage', {
            roomId: 'trusted-room',
            content: `Trusted message ${i}`,
            type: 'text',
          });
        }
      });

      trustedSocket.on('error', (error) => {
        trustedSocket.disconnect();
        done(new Error(`Trusted service should not be rate limited: ${error.message}`));
      });
    });
  });
});
