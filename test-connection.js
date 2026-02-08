#!/usr/bin/env node
/**
 * CallVault Connection Test Script
 * 
 * This script tests the WebSocket connection, messaging, and call functionality
 * of your CallVault server.
 * 
 * Usage:
 *   node test-connection.js <server-url>
 *   
 * Examples:
 *   node test-connection.js wss://callvs.com/ws
 *   node test-connection.js ws://localhost:5000/ws
 */

const WebSocket = require('ws');
const { randomBytes, randomUUID } = require('crypto');

const SERVER_URL = process.argv[2] || 'wss://callvs.com/ws';
const TEST_ADDRESS = 'test_' + randomBytes(8).toString('hex');

console.log('========================================');
console.log('CallVault Connection Test');
console.log('========================================');
console.log(`Server: ${SERVER_URL}`);
console.log(`Test Address: ${TEST_ADDRESS}`);
console.log('');

let ws;
let tests = {
  connection: false,
  registration: false,
  messageEcho: false,
  turnConfig: false
};

function runTest() {
  console.log('[TEST 1] Connecting to WebSocket server...');
  
  try {
    ws = new WebSocket(SERVER_URL);
    
    ws.on('open', () => {
      console.log('✓ WebSocket connected');
      tests.connection = true;
      
      // Test 2: Registration
      console.log('[TEST 2] Sending registration...');
      ws.send(JSON.stringify({
        type: 'register',
        address: TEST_ADDRESS
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`  <- Received: ${msg.type}`);
        
        switch (msg.type) {
          case 'success':
            if (msg.message === 'Registered successfully') {
              console.log('✓ Registration successful');
              console.log(`  Connections: ${msg.connections || 'N/A'}`);
              tests.registration = true;
              
              // Test 3: Send a message to self
              console.log('[TEST 3] Testing message delivery...');
              const testConvoId = `test_convo_${randomUUID()}`;
              ws.send(JSON.stringify({
                type: 'msg:send',
                data: {
                  from_address: TEST_ADDRESS,
                  to_address: TEST_ADDRESS,
                  convo_id: testConvoId,
                  content: 'Test message ' + Date.now(),
                  type: 'text',
                  id: randomUUID(),
                  timestamp: Date.now()
                }
              }));
            }
            break;
            
          case 'msg:ack':
            console.log('✓ Message acknowledged by server');
            break;
            
          case 'msg:incoming':
            console.log('✓ Message delivered back to sender (echo test passed)');
            tests.messageEcho = true;
            
            // Test 4: Check TURN config via HTTP API
            console.log('[TEST 4] Checking TURN configuration...');
            checkTurnConfig();
            break;
            
          case 'error':
            console.error('✗ Server error:', msg.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e.message);
      }
    });
    
    ws.on('error', (err) => {
      console.error('✗ WebSocket error:', err.message);
      if (err.message.includes('certificate')) {
        console.error('  -> SSL/TLS certificate issue - check your HTTPS setup');
      }
      if (err.message.includes('ECONNREFUSED')) {
        console.error('  -> Connection refused - server may be down or port blocked');
      }
      if (err.message.includes('Unexpected server response')) {
        console.error('  -> Server returned error - check WebSocket path (/ws)');
      }
      process.exit(1);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`\nWebSocket closed: code=${code}, reason=${reason}`);
    });
    
  } catch (err) {
    console.error('Failed to create WebSocket:', err.message);
    process.exit(1);
  }
}

async function checkTurnConfig() {
  try {
    // Parse the WebSocket URL to get the base HTTP URL
    const wsUrl = new URL(SERVER_URL);
    const httpProtocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    const turnUrl = `${httpProtocol}//${wsUrl.host}/api/turn-config`;
    
    console.log(`  Fetching: ${turnUrl}`);
    
    const response = await fetch(turnUrl);
    const config = await response.json();
    
    console.log(`  TURN Mode: ${config.mode}`);
    console.log(`  ICE Servers: ${config.iceServers?.length || 0} configured`);
    
    // Check for TURN servers
    const turnServers = config.iceServers?.filter(s => 
      s.urls?.includes('turn:') || (Array.isArray(s.urls) && s.urls.some(u => u.includes('turn:')))
    );
    
    if (turnServers?.length > 0) {
      console.log(`  TURN Servers: ${turnServers.length} found`);
      tests.turnConfig = true;
    } else {
      console.log('✗ No TURN servers configured - calls will likely fail behind NAT');
    }
    
    // Print summary
    printSummary();
    
  } catch (err) {
    console.error('✗ Failed to fetch TURN config:', err.message);
    printSummary();
  }
}

function printSummary() {
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`Connection:  ${tests.connection ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Registration: ${tests.registration ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Message Echo: ${tests.messageEcho ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`TURN Config:  ${tests.turnConfig ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');
  
  if (!tests.connection) {
    console.log('ISSUE: Cannot connect to server');
    console.log('  - Verify server is running');
    console.log('  - Check WebSocket URL is correct');
    console.log('  - Check firewall is not blocking port');
  }
  
  if (!tests.registration) {
    console.log('ISSUE: Registration failed');
    console.log('  - Check server logs for errors');
    console.log('  - Verify database is connected');
  }
  
  if (!tests.messageEcho) {
    console.log('ISSUE: Message delivery not working');
    console.log('  - WebSocket may be closing prematurely');
    console.log('  - Database may be unavailable for message storage');
  }
  
  if (!tests.turnConfig) {
    console.log('ISSUE: TURN not properly configured');
    console.log('  - Set TURN_MODE=custom with your coturn server');
    console.log('  - Or use a paid TURN service like Metered.ca');
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  
  process.exit(tests.connection && tests.registration ? 0 : 1);
}

// Run the test
runTest();

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n✗ Test timed out after 30 seconds');
  printSummary();
}, 30000);
