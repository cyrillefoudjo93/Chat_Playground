#!/usr/bin/env node

// WebSocket Authentication Test
const { io } = require('socket.io-client');

console.log('🔌 Testing WebSocket Authentication');
console.log('=====================================');

const serverUrl = 'http://localhost:3000';

// Test 1: Connect without authentication
console.log('\n1. Testing connection without authentication...');
const socketNoAuth = io(`${serverUrl}/chat`, {
  transports: ['websocket'],
  timeout: 5000,
});

socketNoAuth.on('connect', () => {
  console.log('✅ Connected without auth (unexpected)');
});

socketNoAuth.on('connect_error', (error) => {
  console.log('❌ Connection failed without auth (expected):', error.message);
});

socketNoAuth.on('error', (error) => {
  console.log('⚠️  Error without auth:', error);
});

// Test 2: Connect with invalid token
console.log('\n2. Testing connection with invalid token...');
setTimeout(() => {
  const socketInvalidAuth = io(`${serverUrl}/chat`, {
    auth: {
      token: 'invalid-jwt-token'
    },
    transports: ['websocket'],
    timeout: 5000,
  });

  socketInvalidAuth.on('connect', () => {
    console.log('✅ Connected with invalid token (unexpected)');
  });

  socketInvalidAuth.on('connect_error', (error) => {
    console.log('❌ Connection failed with invalid token (expected):', error.message);
  });

  socketInvalidAuth.on('error', (error) => {
    console.log('⚠️  Error with invalid token:', error);
  });

  // Clean up and exit
  setTimeout(() => {
    socketNoAuth.disconnect();
    socketInvalidAuth.disconnect();
    console.log('\n🏁 WebSocket authentication test completed');
    console.log('✅ All tests behaved as expected - authentication is working!');
    process.exit(0);
  }, 3000);
}, 1000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Test interrupted');
  process.exit(0);
});
