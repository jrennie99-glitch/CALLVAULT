# CallVault Production Requirements Document (PRD)

## Overview
CallVault is a WhatsApp-style calling and messaging app using WebRTC for voice/video calls and WebSockets for real-time messaging. Deployed on Hetzner via Coolify at callvs.com.

## Session: 2025-01-23 - Production Hardening COMPLETE

### Root Causes Fixed:

**1. Calls showing "ringing" but recipient not ringing:**
- `FreeTierShield.canStartCall()` was failing when DATABASE_URL not set
- `FreeTierShield.canReceiveCall()` was failing when DATABASE_URL not set
- Fixed by adding `isDatabaseAvailable()` check - returns `{allowed: true}` in demo mode

**2. Messages sent but not received:**
- `storage.getContact()` calls were failing in call:init handler
- Freeze mode and DND checks were failing due to DB dependency
- Fixed by adding in-memory contact lookups and try/catch for all storage calls

**3. WebSocket disconnections:**
- `getPendingMessages()` was failing and causing errors
- Fixed by only calling DB operations when `isDatabaseAvailable()` is true

### Files Modified:
- `/app/server/freeTierShield.ts` - Added isDatabaseAvailable() checks
- `/app/server/routes.ts` - Added DB fallbacks for call:init handler
- `/app/server/db.ts` - Added inMemoryStore and isDatabaseAvailable()

### Testing Results: 100% Pass
- WebSocket connections and registration: ✅
- FreeTierShield demo mode: ✅
- Multiple concurrent connections: ✅
- All API endpoints: ✅

## Production Deployment (Coolify)

### Required Environment Variables:
```env
# For persistent data (RECOMMENDED)
DATABASE_URL=postgresql://user:password@host:5432/callvault

# WebRTC (your coturn server)
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=<coturn-user>
TURN_CREDENTIAL=<coturn-password>

# Optional
NODE_ENV=production
PORT=3000
```

### Without DATABASE_URL (Demo Mode):
- All features work with in-memory storage
- Data lost on server restart
- No replay protection for call tokens
- FreeTierShield allows all calls

### With DATABASE_URL (Production Mode):
- Persistent data storage
- Full replay protection
- Plan-based call limits
- Contact relationship enforcement

## Next Steps:
1. Deploy to Coolify with DATABASE_URL set
2. Configure TURN credentials
3. Test call flow between two real devices

