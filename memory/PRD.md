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

### Session: 2025-01-XX - Production Hardening

**Features Added/Fixed:**
1. `/api/diagnostics` endpoint - comprehensive production config checker
2. `/api/ice-verify` endpoint - TURN/STUN configuration verifier
3. Enhanced WebRTC signaling logging for debugging
4. `webrtc:peer_offline` message handling for better UX
5. Created PRODUCTION_DIAGNOSTIC_REPORT.md
6. Created VERIFICATION_CHECKLIST.md
7. Documented all required environment variables

**Files Modified:**
- `/app/server/index.ts` - Added diagnostics endpoint
- `/app/server/routes.ts` - Added ICE verify endpoint, improved WebRTC logging
- `/app/client/src/components/CallView.tsx` - Handle peer offline messages

**Configuration Required (Coolify):**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=<coturn-user>
TURN_CREDENTIAL=<coturn-password>
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302
VAPID_PUBLIC_KEY=<generate>
VAPID_PRIVATE_KEY=<generate>
TRUST_PROXY=true
```

## Prioritized Backlog

### P0 (Immediate - Deployment)
- [ ] Configure TURN_MODE=custom in Coolify
- [ ] Set TURN credentials matching coturn server
- [ ] Verify coturn has external-ip=157.180.117.221
- [ ] Open firewall ports (UDP 3478, 5349, 49152-65535)

### P1 (High Priority)
- [ ] Generate and configure VAPID keys for push notifications
- [ ] Test end-to-end call flow after deployment
- [ ] Monitor call success rate after TURN config

### P2 (Nice to Have)
- [ ] Add metrics/logging for call success rates
- [ ] Implement call quality indicators
- [ ] Add automatic TURN server failover

## Architecture Notes

```
Client (React) <--HTTPS/WSS--> Coolify Proxy <--> Node.js Server <--> PostgreSQL
                                    |
                                    v
                               coturn (TURN)
```

- All WebSockets use WSS (auto-detected from page protocol)
- TURN relay for NAT traversal
- Messages stored in PostgreSQL
- Media files in /app/uploads (needs persistent volume)

## Next Tasks
1. Deploy updated code to Coolify
2. Configure environment variables
3. Run verification checklist
4. Test call flow end-to-end
