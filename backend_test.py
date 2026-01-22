#!/usr/bin/env python3
"""
CallVault Backend API Testing Script
Tests all health check, diagnostic, and WebRTC endpoints
"""

import requests
import json
import sys
import time
import websocket
import threading
from datetime import datetime

class CallVaultAPITester:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def run_test(self, name, method, endpoint, expected_status=200, expected_content=None, timeout=10):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        self.tests_run += 1
        
        self.log(f"🔍 Testing {name}...")
        self.log(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            # Check status code
            if response.status_code == expected_status:
                self.log(f"✅ Status: {response.status_code} (Expected: {expected_status})")
                
                # Check content if specified
                if expected_content:
                    try:
                        response_json = response.json()
                        if expected_content in str(response_json):
                            self.log(f"✅ Content check passed")
                            self.tests_passed += 1
                            return True, response_json
                        else:
                            self.log(f"❌ Content check failed - expected '{expected_content}' not found")
                            self.failed_tests.append(f"{name}: Content check failed")
                            return False, response_json
                    except json.JSONDecodeError:
                        # For non-JSON responses, check text content
                        if expected_content in response.text:
                            self.log(f"✅ Content check passed (text)")
                            self.tests_passed += 1
                            return True, response.text
                        else:
                            self.log(f"❌ Content check failed - expected '{expected_content}' not found in text")
                            self.failed_tests.append(f"{name}: Content check failed")
                            return False, response.text
                else:
                    self.tests_passed += 1
                    try:
                        return True, response.json()
                    except:
                        return True, response.text
            else:
                self.log(f"❌ Status: {response.status_code} (Expected: {expected_status})")
                self.failed_tests.append(f"{name}: Status {response.status_code} != {expected_status}")
                return False, None
                
        except requests.exceptions.Timeout:
            self.log(f"❌ Timeout after {timeout}s")
            self.failed_tests.append(f"{name}: Timeout")
            return False, None
        except requests.exceptions.ConnectionError:
            self.log(f"❌ Connection error - server may not be running")
            self.failed_tests.append(f"{name}: Connection error")
            return False, None
        except Exception as e:
            self.log(f"❌ Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, None
    
    def test_health_endpoints(self):
        """Test all health check endpoints"""
        self.log("\n=== HEALTH CHECK ENDPOINTS ===")
        
        # Test root endpoint
        success, response = self.run_test(
            "Root Health Check", 
            "GET", 
            "/", 
            200, 
            "CallVault backend is running"
        )
        
        # Test /health endpoint
        success, response = self.run_test(
            "Health Endpoint", 
            "GET", 
            "/health", 
            200, 
            "ok"
        )
        
        # Test /api/health endpoint
        success, response = self.run_test(
            "API Health Endpoint", 
            "GET", 
            "/api/health", 
            200, 
            "ok"
        )
        
        # Test /api/version endpoint
        success, response = self.run_test(
            "Version Endpoint", 
            "GET", 
            "/api/version", 
            200, 
            "CallVault"
        )
        if success and isinstance(response, dict):
            self.log(f"   Version info: {response}")
    
    def test_diagnostic_endpoints(self):
        """Test diagnostic endpoints"""
        self.log("\n=== DIAGNOSTIC ENDPOINTS ===")
        
        # Test /api/diagnostics endpoint
        success, response = self.run_test(
            "Diagnostics Endpoint", 
            "GET", 
            "/api/diagnostics", 
            200, 
            "CallVault"
        )
        if success and isinstance(response, dict):
            self.log(f"   App: {response.get('app', 'N/A')}")
            self.log(f"   Environment: {response.get('environment', 'N/A')}")
            self.log(f"   Server Port: {response.get('server', {}).get('port', 'N/A')}")
            self.log(f"   TURN Configured: {response.get('webrtc', {}).get('turnConfigured', 'N/A')}")
            self.log(f"   Database Configured: {response.get('database', {}).get('configured', 'N/A')}")
        
        # Test /api/ice-verify endpoint
        success, response = self.run_test(
            "ICE Verification Endpoint", 
            "GET", 
            "/api/ice-verify", 
            200, 
            "status"
        )
        if success and isinstance(response, dict):
            self.log(f"   ICE Status: {response.get('status', 'N/A')}")
            self.log(f"   TURN Servers: {response.get('configuration', {}).get('turnServersCount', 0)}")
            issues = response.get('issues', [])
            if issues:
                self.log(f"   Issues found: {len(issues)}")
                for issue in issues:
                    self.log(f"     - {issue}")
            else:
                self.log(f"   No issues found")
    
    def test_webrtc_endpoints(self):
        """Test WebRTC configuration endpoints"""
        self.log("\n=== WEBRTC ENDPOINTS ===")
        
        # Test /api/turn-config endpoint
        success, response = self.run_test(
            "TURN Config Endpoint", 
            "GET", 
            "/api/turn-config", 
            200, 
            "iceServers"
        )
        if success and isinstance(response, dict):
            ice_servers = response.get('iceServers', [])
            self.log(f"   ICE Servers count: {len(ice_servers)}")
            self.log(f"   Mode: {response.get('mode', 'N/A')}")
            
            # Log server types
            stun_count = sum(1 for server in ice_servers if 'stun:' in str(server.get('urls', '')))
            turn_count = sum(1 for server in ice_servers if 'turn:' in str(server.get('urls', '')))
            self.log(f"   STUN servers: {stun_count}")
            self.log(f"   TURN servers: {turn_count}")
        
        # Test /api/server-time endpoint
        success, response = self.run_test(
            "Server Time Endpoint", 
            "GET", 
            "/api/server-time", 
            200, 
            "serverTime"
        )
        if success and isinstance(response, dict):
            server_time = response.get('serverTime', 0)
            client_time = int(time.time() * 1000)
            time_diff = abs(server_time - client_time)
            self.log(f"   Server time: {server_time}")
            self.log(f"   Client time: {client_time}")
            self.log(f"   Time difference: {time_diff}ms")
    
    def test_call_session_token(self):
        """Test call session token endpoint"""
        self.log("\n=== CALL SESSION TOKEN ENDPOINT ===")
        
        # Test POST /api/call-session-token with required JSON body
        url = f"{self.base_url}/api/call-session-token"
        self.tests_run += 1
        
        self.log("🔍 Testing Call Session Token Endpoint...")
        self.log(f"   URL: {url}")
        
        try:
            # Test data as specified in the review request
            test_data = {"address": "test-address-123"}
            
            response = requests.post(
                url, 
                json=test_data,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                self.log(f"✅ Status: {response.status_code} (Expected: 200)")
                
                try:
                    response_json = response.json()
                    
                    # Check for required fields: token, nonce, iceServers
                    required_fields = ['token', 'nonce', 'iceServers']
                    missing_fields = []
                    
                    for field in required_fields:
                        if field not in response_json:
                            missing_fields.append(field)
                    
                    if not missing_fields:
                        self.log("✅ All required fields present (token, nonce, iceServers)")
                        self.log(f"   Token: {response_json.get('token', 'N/A')[:20]}...")
                        self.log(f"   Nonce: {response_json.get('nonce', 'N/A')[:20]}...")
                        self.log(f"   ICE Servers: {len(response_json.get('iceServers', []))}")
                        self.log(f"   Plan: {response_json.get('plan', 'N/A')}")
                        self.log(f"   Allow TURN: {response_json.get('allowTurn', 'N/A')}")
                        self.log(f"   Allow Video: {response_json.get('allowVideo', 'N/A')}")
                        self.tests_passed += 1
                    else:
                        self.log(f"❌ Missing required fields: {missing_fields}")
                        self.failed_tests.append(f"Call Session Token: Missing fields {missing_fields}")
                        
                except json.JSONDecodeError:
                    self.log("❌ Response is not valid JSON")
                    self.failed_tests.append("Call Session Token: Invalid JSON response")
            else:
                self.log(f"❌ Status: {response.status_code} (Expected: 200)")
                try:
                    error_response = response.json()
                    self.log(f"   Error: {error_response}")
                except:
                    self.log(f"   Response text: {response.text}")
                self.failed_tests.append(f"Call Session Token: Status {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.log("❌ Timeout after 10s")
            self.failed_tests.append("Call Session Token: Timeout")
        except requests.exceptions.ConnectionError:
            self.log("❌ Connection error")
            self.failed_tests.append("Call Session Token: Connection error")
        except Exception as e:
            self.log(f"❌ Error: {str(e)}")
            self.failed_tests.append(f"Call Session Token: {str(e)}")
    
    def test_websocket_endpoint(self):
        """Test WebSocket endpoint availability (HTTP upgrade check)"""
        self.log("\n=== WEBSOCKET ENDPOINT ===")
        
        # Test WebSocket endpoint with HTTP (should get upgrade error or 400)
        try:
            response = requests.get(f"{self.base_url}/ws", timeout=5)
            if response.status_code in [400, 426]:  # Bad Request or Upgrade Required
                self.log("✅ WebSocket endpoint available (HTTP upgrade required as expected)")
                self.tests_run += 1
                self.tests_passed += 1
            else:
                self.log(f"⚠️  WebSocket endpoint returned unexpected status: {response.status_code}")
                self.tests_run += 1
        except requests.exceptions.ConnectionError:
            self.log("❌ WebSocket endpoint not accessible")
            self.tests_run += 1
            self.failed_tests.append("WebSocket endpoint: Connection error")
        except Exception as e:
            self.log(f"❌ WebSocket test error: {str(e)}")
            self.tests_run += 1
            self.failed_tests.append(f"WebSocket endpoint: {str(e)}")
    
    def test_server_binding(self):
        """Test server binding and accessibility"""
        self.log("\n=== SERVER BINDING TEST ===")
        
        # Test if server is accessible on 0.0.0.0:3000
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                self.log("✅ Server accessible on configured port")
                self.tests_run += 1
                self.tests_passed += 1
            else:
                self.log(f"❌ Server returned status {response.status_code}")
                self.tests_run += 1
                self.failed_tests.append(f"Server binding: Status {response.status_code}")
        except Exception as e:
            self.log(f"❌ Server binding test failed: {str(e)}")
            self.tests_run += 1
            self.failed_tests.append(f"Server binding: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        self.log("🚀 Starting CallVault Backend API Tests")
        self.log(f"   Base URL: {self.base_url}")
        self.log(f"   Test time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Run all test suites
        self.test_health_endpoints()
        self.test_diagnostic_endpoints()
        self.test_webrtc_endpoints()
        self.test_call_session_token()
        self.test_websocket_endpoint()
        self.test_server_binding()
        
        # Print summary
        self.log("\n" + "="*50)
        self.log("📊 TEST SUMMARY")
        self.log("="*50)
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
            self.log("🎉 Backend tests PASSED!")
            return 0
        else:
            self.log("💥 Backend tests FAILED!")
            return 1

def main():
    """Main test runner"""
    tester = CallVaultAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())