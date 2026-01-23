#!/usr/bin/env python3
"""
CallVault WebSocket Testing Script
Tests WebSocket messaging and calling functionality between two users
"""

import asyncio
import websockets
import json
import sys
import time
import uuid
from datetime import datetime

class WebSocketTester:
    def __init__(self, base_url="ws://localhost:3000"):
        self.base_url = base_url
        self.ws_url = f"{base_url}/ws"
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    async def test_two_user_websocket_flow(self):
        """Test complete WebSocket flow between two users"""
        self.log("🚀 Starting Two-User WebSocket Flow Test")
        self.log(f"   WebSocket URL: {self.ws_url}")
        
        # Generate test user addresses
        user_a_address = f"test_user_a_{int(time.time())}"
        user_b_address = f"test_user_b_{int(time.time())}"
        
        self.log(f"   User A: {user_a_address}")
        self.log(f"   User B: {user_b_address}")
        
        try:
            # Test 1: WebSocket connection and registration between TWO users
            await self.test_websocket_connections(user_a_address, user_b_address)
            
            # Test 2: Basic ping/pong functionality
            await self.test_ping_pong()
            
            # Note: msg:send and call:init require cryptographic signatures
            # These would need proper Ed25519 key pairs and signing
            self.log("\n📝 Note: msg:send and call:init require cryptographic signatures")
            self.log("   Full message/call testing would need Ed25519 keypairs")
            
        except Exception as e:
            self.log(f"❌ Test flow error: {str(e)}")
            self.failed_tests.append(f"WebSocket flow: {str(e)}")
    
    async def test_websocket_connections(self, user_a_address, user_b_address):
        """Test WebSocket connection and registration between two users"""
        self.log("\n=== TEST 1: WebSocket Connection and Registration ===")
        self.tests_run += 1
        
        user_a_ws = None
        user_b_ws = None
        
        try:
            # Connect both users
            self.log("📡 Connecting User A...")
            user_a_ws = await websockets.connect(self.ws_url)
            self.log("✅ User A connected")
            
            self.log("📡 Connecting User B...")
            user_b_ws = await websockets.connect(self.ws_url)
            self.log("✅ User B connected")
            
            # Register User A
            self.log("🔐 Registering User A...")
            register_a = {
                "type": "register",
                "address": user_a_address
            }
            await user_a_ws.send(json.dumps(register_a))
            
            # Wait for registration response
            response_a = await asyncio.wait_for(user_a_ws.recv(), timeout=5.0)
            response_a_data = json.loads(response_a)
            self.log(f"📨 User A registration response: {response_a_data}")
            
            # Register User B
            self.log("🔐 Registering User B...")
            register_b = {
                "type": "register",
                "address": user_b_address
            }
            await user_b_ws.send(json.dumps(register_b))
            
            # Wait for registration response
            response_b = await asyncio.wait_for(user_b_ws.recv(), timeout=5.0)
            response_b_data = json.loads(response_b)
            self.log(f"📨 User B registration response: {response_b_data}")
            
            # Verify both registrations were successful (correct response format)
            if (response_a_data.get("type") == "success" and 
                response_b_data.get("type") == "success" and
                "Registered successfully" in response_a_data.get("message", "") and
                "Registered successfully" in response_b_data.get("message", "")):
                self.log("✅ Both users registered successfully")
                self.tests_passed += 1
                return user_a_ws, user_b_ws
            else:
                self.log("❌ Registration failed for one or both users")
                self.failed_tests.append("WebSocket registration: Failed")
                return None, None
                
        except asyncio.TimeoutError:
            self.log("❌ Registration timeout")
            self.failed_tests.append("WebSocket registration: Timeout")
            return None, None
        except Exception as e:
            self.log(f"❌ Registration error: {str(e)}")
            self.failed_tests.append(f"WebSocket registration: {str(e)}")
            return None, None
        finally:
            if user_a_ws:
                await user_a_ws.close()
            if user_b_ws:
                await user_b_ws.close()
    
    async def test_ping_pong(self):
        """Test basic ping/pong functionality"""
        self.log("\n=== TEST 2: Ping/Pong Functionality ===")
        self.tests_run += 1
        
        ws = None
        try:
            # Connect to WebSocket
            ws = await websockets.connect(self.ws_url)
            self.log("✅ WebSocket connected for ping test")
            
            # Send ping
            ping_message = {"type": "ping"}
            await ws.send(json.dumps(ping_message))
            self.log("📤 Sent ping message")
            
            # Wait for pong response
            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
            response_data = json.loads(response)
            self.log(f"📨 Received response: {response_data}")
            
            # Verify pong response
            if response_data.get("type") == "pong":
                self.log("✅ Ping/Pong functionality working")
                self.tests_passed += 1
            else:
                self.log("❌ Expected pong response")
                self.failed_tests.append("Ping/Pong: Wrong response type")
                
        except asyncio.TimeoutError:
            self.log("❌ Ping timeout")
            self.failed_tests.append("Ping/Pong: Timeout")
        except Exception as e:
            self.log(f"❌ Ping/Pong error: {str(e)}")
            self.failed_tests.append(f"Ping/Pong: {str(e)}")
        finally:
            if ws:
                await ws.close()
    
    async def test_message_sending(self, user_a_address, user_b_address):
        """Test message sending from User A to User B"""
        self.log("\n=== TEST 2: Message Sending (User A → User B) ===")
        self.tests_run += 1
        
        user_a_ws = None
        user_b_ws = None
        
        try:
            # Reconnect both users
            user_a_ws = await websockets.connect(self.ws_url)
            user_b_ws = await websockets.connect(self.ws_url)
            
            # Register both users
            await user_a_ws.send(json.dumps({
                "type": "register",
                "address": user_a_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_a_ws.recv()  # consume registration response
            
            await user_b_ws.send(json.dumps({
                "type": "register",
                "address": user_b_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_b_ws.recv()  # consume registration response
            
            # Send message from User A to User B
            test_message = {
                "type": "msg:send",
                "to_address": user_b_address,
                "from_address": user_a_address,
                "content": "Hello from User A!",
                "timestamp": int(time.time() * 1000),
                "nonce": str(uuid.uuid4())
            }
            
            self.log(f"📤 User A sending message to User B: {test_message['content']}")
            await user_a_ws.send(json.dumps(test_message))
            
            # Wait for User B to receive msg:incoming
            self.log("⏳ Waiting for User B to receive msg:incoming...")
            
            # Set up a timeout for receiving the message
            try:
                incoming_message = await asyncio.wait_for(user_b_ws.recv(), timeout=10.0)
                incoming_data = json.loads(incoming_message)
                self.log(f"📨 User B received: {incoming_data}")
                
                # Verify it's a msg:incoming message
                if (incoming_data.get("type") == "msg:incoming" and 
                    incoming_data.get("from_address") == user_a_address and
                    incoming_data.get("content") == "Hello from User A!"):
                    self.log("✅ Message successfully delivered from User A to User B")
                    self.tests_passed += 1
                else:
                    self.log(f"❌ Unexpected message format or content: {incoming_data}")
                    self.failed_tests.append("Message sending: Wrong format/content")
                    
            except asyncio.TimeoutError:
                self.log("❌ Timeout waiting for msg:incoming")
                self.failed_tests.append("Message sending: Timeout waiting for delivery")
                
        except Exception as e:
            self.log(f"❌ Message sending error: {str(e)}")
            self.failed_tests.append(f"Message sending: {str(e)}")
        finally:
            if user_a_ws:
                await user_a_ws.close()
            if user_b_ws:
                await user_b_ws.close()
    
    async def test_call_initiation(self, user_a_address, user_b_address):
        """Test call initiation from User A to User B"""
        self.log("\n=== TEST 3: Call Initiation (User A → User B) ===")
        self.tests_run += 1
        
        user_a_ws = None
        user_b_ws = None
        
        try:
            # Reconnect both users
            user_a_ws = await websockets.connect(self.ws_url)
            user_b_ws = await websockets.connect(self.ws_url)
            
            # Register both users
            await user_a_ws.send(json.dumps({
                "type": "register",
                "address": user_a_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_a_ws.recv()  # consume registration response
            
            await user_b_ws.send(json.dumps({
                "type": "register",
                "address": user_b_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_b_ws.recv()  # consume registration response
            
            # Initiate call from User A to User B
            call_session_id = str(uuid.uuid4())
            call_init = {
                "type": "call:init",
                "to_address": user_b_address,
                "from_address": user_a_address,
                "sessionId": call_session_id,
                "callType": "audio",
                "timestamp": int(time.time() * 1000),
                "nonce": str(uuid.uuid4())
            }
            
            self.log(f"📞 User A initiating call to User B (session: {call_session_id})")
            await user_a_ws.send(json.dumps(call_init))
            
            # Wait for User B to receive call:incoming
            self.log("⏳ Waiting for User B to receive call:incoming...")
            
            try:
                incoming_call = await asyncio.wait_for(user_b_ws.recv(), timeout=10.0)
                incoming_data = json.loads(incoming_call)
                self.log(f"📨 User B received: {incoming_data}")
                
                # Verify it's a call:incoming message
                if (incoming_data.get("type") == "call:incoming" and 
                    incoming_data.get("from_address") == user_a_address and
                    incoming_data.get("sessionId") == call_session_id):
                    self.log("✅ Call successfully initiated from User A to User B")
                    
                    # Test call:ringing response
                    await self.test_call_ringing(user_a_ws, user_b_ws, user_a_address, user_b_address, call_session_id)
                    
                    self.tests_passed += 1
                else:
                    self.log(f"❌ Unexpected call format: {incoming_data}")
                    self.failed_tests.append("Call initiation: Wrong format")
                    
            except asyncio.TimeoutError:
                self.log("❌ Timeout waiting for call:incoming")
                self.failed_tests.append("Call initiation: Timeout waiting for call:incoming")
                
        except Exception as e:
            self.log(f"❌ Call initiation error: {str(e)}")
            self.failed_tests.append(f"Call initiation: {str(e)}")
        finally:
            if user_a_ws:
                await user_a_ws.close()
            if user_b_ws:
                await user_b_ws.close()
    
    async def test_call_ringing(self, user_a_ws, user_b_ws, user_a_address, user_b_address, call_session_id):
        """Test call:ringing is sent to caller when recipient is online"""
        self.log("\n=== TEST 4: Call Ringing Response ===")
        self.tests_run += 1
        
        try:
            # User B sends call:ringing back to User A
            ringing_response = {
                "type": "call:ringing",
                "to_address": user_a_address,
                "from_address": user_b_address,
                "sessionId": call_session_id,
                "timestamp": int(time.time() * 1000)
            }
            
            self.log("📞 User B sending call:ringing to User A...")
            await user_b_ws.send(json.dumps(ringing_response))
            
            # Wait for User A to receive call:ringing
            self.log("⏳ Waiting for User A to receive call:ringing...")
            
            try:
                ringing_message = await asyncio.wait_for(user_a_ws.recv(), timeout=10.0)
                ringing_data = json.loads(ringing_message)
                self.log(f"📨 User A received: {ringing_data}")
                
                # Verify it's a call:ringing message
                if (ringing_data.get("type") == "call:ringing" and 
                    ringing_data.get("from_address") == user_b_address and
                    ringing_data.get("sessionId") == call_session_id):
                    self.log("✅ Call ringing successfully sent to caller")
                    self.tests_passed += 1
                else:
                    self.log(f"❌ Unexpected ringing format: {ringing_data}")
                    self.failed_tests.append("Call ringing: Wrong format")
                    
            except asyncio.TimeoutError:
                self.log("❌ Timeout waiting for call:ringing")
                self.failed_tests.append("Call ringing: Timeout waiting for call:ringing")
                
        except Exception as e:
            self.log(f"❌ Call ringing error: {str(e)}")
            self.failed_tests.append(f"Call ringing: {str(e)}")
    
    async def test_freetier_shield_without_database(self):
        """Test FreeTierShield allows calls without database"""
        self.log("\n=== TEST 5: FreeTierShield Without Database ===")
        self.tests_run += 1
        
        try:
            # This test verifies that the FreeTierShield.canStartCall and FreeTierShield.canReceiveCall
            # methods return {allowed: true} when isDatabaseAvailable() returns false
            
            # Since we're testing the production hardening where DATABASE_URL is not set,
            # the FreeTierShield should allow calls in demo mode
            
            user_a_address = f"freetier_test_a_{int(time.time())}"
            user_b_address = f"freetier_test_b_{int(time.time())}"
            
            user_a_ws = await websockets.connect(self.ws_url)
            user_b_ws = await websockets.connect(self.ws_url)
            
            # Register both users
            await user_a_ws.send(json.dumps({
                "type": "register",
                "address": user_a_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_a_ws.recv()
            
            await user_b_ws.send(json.dumps({
                "type": "register",
                "address": user_b_address,
                "timestamp": int(time.time() * 1000)
            }))
            await user_b_ws.recv()
            
            # Try to initiate a call (should be allowed without database)
            call_session_id = str(uuid.uuid4())
            call_init = {
                "type": "call:init",
                "to_address": user_b_address,
                "from_address": user_a_address,
                "sessionId": call_session_id,
                "callType": "audio",
                "timestamp": int(time.time() * 1000),
                "nonce": str(uuid.uuid4())
            }
            
            self.log("📞 Testing call initiation without database...")
            await user_a_ws.send(json.dumps(call_init))
            
            # If FreeTierShield is working correctly, User B should receive the call
            try:
                incoming_call = await asyncio.wait_for(user_b_ws.recv(), timeout=10.0)
                incoming_data = json.loads(incoming_call)
                
                if incoming_data.get("type") == "call:incoming":
                    self.log("✅ FreeTierShield allows calls without database (demo mode)")
                    self.tests_passed += 1
                else:
                    self.log(f"❌ Unexpected response: {incoming_data}")
                    self.failed_tests.append("FreeTierShield: Unexpected response")
                    
            except asyncio.TimeoutError:
                self.log("❌ Call blocked - FreeTierShield may not be working correctly")
                self.failed_tests.append("FreeTierShield: Call blocked without database")
            
            await user_a_ws.close()
            await user_b_ws.close()
            
        except Exception as e:
            self.log(f"❌ FreeTierShield test error: {str(e)}")
            self.failed_tests.append(f"FreeTierShield: {str(e)}")
    
    async def run_all_tests(self):
        """Run all WebSocket tests"""
        self.log("🚀 Starting CallVault WebSocket Tests")
        self.log(f"   WebSocket URL: {self.ws_url}")
        self.log(f"   Test time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Run all test suites
        await self.test_two_user_websocket_flow()
        await self.test_freetier_shield_without_database()
        
        # Print summary
        self.log("\n" + "="*60)
        self.log("📊 WEBSOCKET TEST SUMMARY")
        self.log("="*60)
        self.log(f"Total tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed}")
        self.log(f"Failed: {len(self.failed_tests)}")
        
        if self.failed_tests:
            self.log("\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failed_tests, 1):
                self.log(f"   {i}. {failure}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"\nSuccess rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            self.log("🎉 WebSocket tests PASSED!")
            return 0
        else:
            self.log("💥 WebSocket tests FAILED!")
            return 1

async def main():
    """Main test runner"""
    tester = WebSocketTester()
    return await tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))