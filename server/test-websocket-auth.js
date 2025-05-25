#!/usr/bin/env node

// WebSocket Authentication Test
const { io } = require('socket.io-client');

console.log('🔌 Testing WebSocket Authentication');
console.log('=====================================');

const serverUrl = 'http://localhost:3000';
let testsPassed = 0;
const totalTests = 2;
let test1ErrorReceived = false;
let test2ErrorReceived = false;

// Test 1: Connect without authentication
console.log('\n1. Testing connection without authentication...');
const socketNoAuth = io(`${serverUrl}/chat`, {
  transports: ['websocket'],
  timeout: 5000,
  reconnection: false, // Disable reconnection for testing
});

socketNoAuth.on('connect', () => {
  if (!test1ErrorReceived) {
    console.error('❌ Test 1 FAILED: Connected without auth token (unexpected)');
  } else {
    // This might still happen if the server disconnects slightly after emitting an error
    console.log('ℹ️  Test 1: Connected briefly after error, then likely disconnected.');
  }
});

socketNoAuth.on('connect_error', (error) => {
  console.log('✅ Test 1 PASSED: Connection failed without auth token (expected):', error.message);
  test1ErrorReceived = true;
  testsPassed++;
  socketNoAuth.disconnect(); // Disconnect after expected error
});

socketNoAuth.on('error', (error) => { // General error listener
  if (error && error.message && error.message.includes('Authentication required')) {
    console.log('✅ Test 1 PASSED: Received authentication required error (expected):', error.message);
    test1ErrorReceived = true;
    if (!socketNoAuth.disconnected) testsPassed++; // Avoid double counting if connect_error also fired
  } else {
    console.warn('⚠️  Test 1: Received generic error without auth:', error);
  }
  socketNoAuth.disconnect(); // Disconnect after expected error
});


// Test 2: Connect with invalid token
console.log('\n2. Testing connection with invalid token...');
const socketInvalidAuth = io(`${serverUrl}/chat`, {
  auth: {
    token: 'invalid-jwt-token'
  },
  transports: ['websocket'],
  timeout: 5000,
  reconnection: false, // Disable reconnection for testing
});

socketInvalidAuth.on('connect', () => {
  if (!test2ErrorReceived) {
    console.error('❌ Test 2 FAILED: Connected with invalid token (unexpected)');
  } else {
    console.log('ℹ️  Test 2: Connected briefly after error, then likely disconnected.');
  }
});

socketInvalidAuth.on('connect_error', (error) => {
  console.log('✅ Test 2 PASSED: Connection failed with invalid token (expected):', error.message);
  test2ErrorReceived = true;
  testsPassed++;
  socketInvalidAuth.disconnect(); // Disconnect after expected error
});

socketInvalidAuth.on('error', (error) => { // General error listener
  if (error && error.message && (error.message.includes('Authentication failed') || error.message.includes('Invalid authentication token'))) {
    console.log('✅ Test 2 PASSED: Received invalid token error (expected):', error.message);
    test2ErrorReceived = true;
    if(!socketInvalidAuth.disconnected) testsPassed++; // Avoid double counting if connect_error also fired
  } else {
    console.warn('⚠️  Test 2: Received generic error with invalid token:', error);
  }
  socketInvalidAuth.disconnect(); // Disconnect after expected error
});

// Clean up and exit
setTimeout(() => {
  console.log('\n🏁 WebSocket authentication test completed');
  if (testsPassed === totalTests) {
    console.log(`✅ All ${totalTests} tests passed - authentication is working as expected!`);
    process.exit(0);
  } else {
    console.error(`❌ ${totalTests - testsPassed} out of ${totalTests} tests failed.`);
    process.exit(1);
  }
}, 7000); // Increased timeout to allow events to fire

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Test interrupted');
  socketNoAuth.disconnect();
  socketInvalidAuth.disconnect();
  process.exit(0);
});
