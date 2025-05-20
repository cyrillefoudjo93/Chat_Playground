import { io, Socket } from 'socket.io-client';

const URL = 'http://localhost:3001/chat'; // Your NestJS WebSocket server URL and namespace

// IMPORTANT: Replace 'YOUR_JWT_TOKEN_HERE' with a valid JWT token
// that your NestJS backend can verify. This is crucial for authentication.
// In a real application, this token would be obtained after user login.
const TOKEN = 'YOUR_JWT_TOKEN_HERE';

export const socket: Socket = io(URL, {
  autoConnect: false, // We will manually connect
  transports: ['websocket'], // Prefer WebSocket transport
  auth: {
    token: TOKEN,
  },
});

socket.on('connect', () => {
  console.log('Connected to NestJS Chat Gateway (Socket.IO)');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from NestJS Chat Gateway (Socket.IO):', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection Error with NestJS Chat Gateway (Socket.IO):', error);
});

// You can add more event listeners here for custom events from the server
// For example:
// socket.on('newMessage', (data) => {
//   console.log('Received new message from server:', data);
// });

// socket.on('aiToken', (data) => {
//   console.log('Received AI token:', data);
// });

// socket.on('aiComplete', (data) => {
//   console.log('Received AI completion:', data);
// });

// socket.on('aiError', (data) => {
//   console.error('Received AI error:', data);
// });
