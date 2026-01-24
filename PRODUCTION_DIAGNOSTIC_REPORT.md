# CallVault Production Diagnostic Report
## Domain: callvs.com | Server: 157.180.117.221 (Hetzner + Coolify)

**Generated**: Auto-generated during production hardening

---

## PHASE 1 — BASELINE DIAGNOSIS

### A) Runtime Details

| Item | Status | Details |
|------|--------|---------|
| **App Type** | Node.js/Express + React | Full-stack TypeScript app |
| **Build System** | Vite (frontend) + esbuild (backend) | Outputs to `dist/` |
| **Port Binding** | `0.0.0.0:${PORT}` | Default: 3000 (prod), 5000 (dev) |
| **Trust Proxy** | ✅ Enabled | `app.set("trust proxy", true)` in server/index.ts |
| **WebSocket Path** | `/ws` | WSS upgrade handled via HTTP server |
| **ICE Server Config** | `/api/turn-config` | Dynamic based on TURN_MODE env |

### B) Environment Requirements

**Required Environment Variables for Production:**

```env
# Core
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...

# TURN/STUN (for WebRTC)
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=<your-coturn-username>
TURN_CREDENTIAL=<your-coturn-password>
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302

# Push Notifications (optional but recommended)
VAPID_PUBLIC_KEY=<generate-with-npx-web-push-generate-vapid-keys>
VAPID_PRIVATE_KEY=<corresponding-private-key>

# Proxy Trust
TRUST_PROXY=true
```

### C) Issues Identified

#### 1. **CRITICAL: Calls Show "Ringing" But Don't Ring**

**Root Cause Analysis:**
- WebSocket signaling IS working (calls show "ringing" state)
- The issue is WebRTC ICE candidates not being exchanged OR media not flowing
- Likely causes:
  1. TURN_MODE not set to "custom" (defaulting to public OpenRelay which may be blocked)
  2. Missing/incorrect TURN credentials
  3. Firewall blocking UDP 3478, 5349, or relay range (49152-65535)
  4. coturn `external-ip` not configured correctly for NAT

#### 2. **WebRTC TURN/STUN Configuration**

Current code in `/api/turn-config`:
- Supports `TURN_MODE`: "public" (OpenRelay), "custom" (your coturn), "off" (STUN only)
- Custom mode requires: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`
- Also supports Metered.ca as alternative

**Required Fix:**
- Ensure `TURN_MODE=custom` is set in Coolify
- Ensure coturn credentials match app config
- Ensure coturn has `external-ip=157.180.117.221` set

#### 3. **WebSocket Secure Context**

The frontend correctly auto-detects protocol:
```typescript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws`;
```

✅ This is correct - no fix needed.

#### 4. **Media Storage**

Video messages use local filesystem:
- Upload endpoint: `/api/upload`
- Serves from: `/api/files/:fileId`
- Storage path: `/app/uploads/`

**For Production:**
- Ensure `/app/uploads` is a persistent volume in Coolify
- Verify upload size limits in proxy config

---

## PHASE 2 — WebRTC (TURN/STUN) FIX PLAN

### Coturn Configuration Required

Coturn MUST have these settings for callvs.com:

```
# /etc/turnserver.conf (on Hetzner server)
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

# CRITICAL: Set external IP for NAT traversal
external-ip=157.180.117.221

# Realm and server name
realm=callvs.com
server-name=callvs.com

# Authentication
lt-cred-mech
user=<TURN_USERNAME>:<TURN_CREDENTIAL>

# Or use shared secret for TURN REST API
# use-auth-secret
# static-auth-secret=<TURN_SHARED_SECRET>

# Security
fingerprint
no-tlsv1
no-tlsv1_1
no-loopback-peers
no-multicast-peers

# Relay port range (MUST match firewall!)
min-port=49152
max-port=65535

# Logging
log-file=/var/log/turnserver.log
verbose
```

### Firewall Rules Required

On Hetzner server (ufw or iptables):
```bash
# STUN/TURN signaling
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp   # TURN over TLS
ufw allow 5349/udp

# TURN relay range
ufw allow 49152:65535/udp
```

### App Environment Variables

In Coolify, set:
```env
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=<same-as-coturn-user>
TURN_CREDENTIAL=<same-as-coturn-password>
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302
```

---

## PHASE 3 — Signaling Fix (Ringing But No Ring)

The signaling chain:

1. Caller sends `call:init` via WebSocket
2. Server validates signature, finds recipient
3. Server sends `call:incoming` to recipient
4. Recipient's phone should ring (via `IncomingCallModal`)
5. Recipient accepts → `call:accept` sent back
6. Both sides exchange WebRTC offer/answer/ICE

**Current Implementation Status:**
- ✅ WebSocket signaling is implemented correctly
- ✅ Push notifications supported for offline recipients
- ✅ Call policies (DND, blocklist, business hours) implemented

**Potential Issues:**
1. If recipient's WebSocket disconnects and reconnects, they may miss `call:incoming`
2. Push notification may not wake the app on mobile browsers
3. Audio unlock required for ringtone playback on iOS/Safari

---

## PHASE 4 — SMS Status

**Per User Requirements:** NO SMS INTEGRATION NEEDED

- All messaging is WhatsApp-style in-app messaging via WebSockets
- Messages stored in PostgreSQL database
- Push notifications used for offline delivery
- NO Twilio/Telnyx/SMS provider needed

---

## PHASE 5 — Video Messages / Media Uploads

**Current Implementation:**
- Uploads stored at `/app/uploads/`
- Served via `/api/files/:fileId`
- Max size: 10MB (in code)

**Production Requirements:**
1. Mount persistent volume to `/app/uploads` in Coolify
2. Ensure proxy allows 10MB+ uploads (nginx/Caddy config)

---

## ACTION ITEMS

### Immediate (Coolify Environment)

1. [ ] Set `TURN_MODE=custom`
2. [ ] Set `TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp`
3. [ ] Set `TURN_USERNAME` and `TURN_CREDENTIAL` matching coturn
4. [ ] Generate and set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
5. [ ] Ensure `NODE_ENV=production`

### Server-side (Hetzner/coturn)

1. [ ] Verify coturn is running: `systemctl status coturn`
2. [ ] Verify coturn config has `external-ip=157.180.117.221`
3. [ ] Verify firewall allows UDP 3478, 5349, 49152-65535
4. [ ] Test TURN server: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

### App Code (This Session)

1. [ ] Add diagnostic endpoint for TURN/ICE verification
2. [ ] Add better error logging for WebRTC failures
3. [ ] Ensure WSS works correctly with proxy headers

---

## VERIFICATION CHECKLIST

After fixes, verify:

1. **STUN/TURN Test**
   - Go to https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   - Add: `stun:callvs.com:3478`
   - Add: `turn:callvs.com:3478` with credentials
   - Click "Gather candidates"
   - Must see `relay` candidates (TURN) and `srflx` candidates (STUN)

2. **WebSocket Test**
   - Open browser console on https://callvs.com
   - Check for `WebSocket connected` log
   - No mixed-content warnings

3. **Call Test**
   - Open app in two browsers/devices
   - Initiate call from one to the other
   - Both devices must ring
   - Audio/video must flow

4. **Message Test**
   - Send message from one user to another
   - Message appears in real-time
   - Works when recipient is offline (queued and delivered on reconnect)

---

*Report generated for production hardening of CallVault on callvs.com*
