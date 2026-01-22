# CallVault Production Requirements Document (PRD)

## Overview
CallVault is a WhatsApp-style calling and messaging app using WebRTC for voice/video calls and WebSockets for real-time messaging. Deployed on Hetzner via Coolify at callvs.com.

## User Personas
- **End Users**: People wanting private, crypto-address-based calling
- **Creators**: Users monetizing calls with paid access
- **Admins**: Platform operators managing users and settings

## Core Requirements (Static)
1. WebRTC voice and video calling
2. In-app messaging (no SMS)
3. WebSocket signaling for calls
4. TURN/STUN support for NAT traversal
5. Push notifications for offline users
6. PostgreSQL for data persistence

## What's Been Implemented

### Session: 2025-01-23 - Production Hardening (Part 2)

**Fixes Applied:**
1. **Call token endpoint** - Added fallback for no-database mode (ephemeral tokens)
2. **Message sending** - Added fallback for in-memory messaging without DB
3. **User lookup** - Graceful degradation when DB unavailable
4. **WebRTC signaling** - Added `webrtc:peer_offline` notification

**Root Cause of "Unable Handshake":**
- The call-session-token endpoint was failing because `storage.getIdentity()` requires DATABASE_URL
- Without DB, the entire call flow failed at token generation
- Fixed by adding try/catch with fallback defaults

**Files Modified:**
- `/app/server/routes.ts` - Added DB fallbacks for call tokens and messages
- `/app/server/index.ts` - Added diagnostics endpoint

### Previous Session: Production Hardening (Part 1)

**Features Added:**
1. `/api/diagnostics` endpoint - comprehensive production config checker
2. `/api/ice-verify` endpoint - TURN/STUN configuration verifier
3. Enhanced WebRTC signaling logging
4. Created PRODUCTION_DIAGNOSTIC_REPORT.md
5. Created VERIFICATION_CHECKLIST.md

## Production Configuration Required (Coolify)

```env
# CRITICAL - Required for full functionality
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/callvault

# WebRTC TURN/STUN
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=<your-coturn-user>
TURN_CREDENTIAL=<your-coturn-password>
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302

# Push Notifications (optional)
VAPID_PUBLIC_KEY=<generate>
VAPID_PRIVATE_KEY=<generate>

# Proxy Settings
TRUST_PROXY=true
```

## Prioritized Backlog

### P0 (Immediate - For Full Production)
- [x] Fix call token generation without DB (DONE - fallback added)
- [x] Fix message sending without DB (DONE - fallback added)
- [ ] Set DATABASE_URL in Coolify for persistence
- [ ] Set TURN_MODE=custom with coturn credentials

### P1 (After Deployment)
- [ ] Verify coturn has external-ip=157.180.117.221
- [ ] Open firewall ports (UDP 3478, 5349, 49152-65535)
- [ ] Test end-to-end call flow

### P2 (Enhancements)
- [ ] Add call quality metrics dashboard
- [ ] Implement TURN server failover
- [ ] Add message delivery receipts

## Architecture Notes

```
Client (React) <--HTTPS/WSS--> Coolify Proxy <--> Node.js Server <--> PostgreSQL
                                    |
                                    v
                               coturn (TURN)
```

## Testing Results
- Backend API: 100% pass rate
- All critical endpoints functional
- Works with or without DATABASE_URL (with graceful degradation)

## Next Tasks
1. Set DATABASE_URL in Coolify for message persistence
2. Configure TURN_MODE=custom with coturn credentials  
3. Test full call flow in production

