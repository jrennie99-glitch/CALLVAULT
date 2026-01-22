# CallVault Production Verification Checklist
## Domain: callvs.com

---

## Pre-Deployment Configuration

### 1. Coolify Environment Variables

Set these in your Coolify application settings:

```env
# Core
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@host:5432/callvault

# TURN/STUN (WebRTC - CRITICAL for calls to work)
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=your_coturn_username
TURN_CREDENTIAL=your_coturn_password
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302

# Push Notifications (recommended)
VAPID_PUBLIC_KEY=<generate with: npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<corresponding private key>

# Proxy Trust (required behind Coolify)
TRUST_PROXY=true
```

### 2. Coturn Server Configuration

Ensure your coturn server has these settings in `/etc/turnserver.conf`:

```
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=157.180.117.221

realm=callvs.com
server-name=callvs.com

lt-cred-mech
user=<TURN_USERNAME>:<TURN_CREDENTIAL>

fingerprint
no-tlsv1
no-tlsv1_1
no-loopback-peers
no-multicast-peers

min-port=49152
max-port=65535
```

### 3. Firewall Rules (Hetzner + Server)

```bash
# On server (ufw)
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
```

Also configure in Hetzner Cloud Firewall if applicable.

---

## Post-Deployment Verification Tests

### Test 1: Server Health

```bash
# Health check
curl -s https://callvs.com/health
# Expected: "CallVault backend is running" or JSON {"ok":true}

curl -s https://callvs.com/api/health
# Expected: {"ok":true,"timestamp":...}
```

### Test 2: Diagnostics Endpoint

```bash
curl -s https://callvs.com/api/diagnostics | jq .
```

Check that:
- `webrtc.turnConfigured` is `true`
- `webrtc.turnMode` is `"custom"`
- `push.vapidConfigured` is `true` (if push enabled)
- `database.configured` is `true`

### Test 3: ICE/TURN Verification

```bash
curl -s https://callvs.com/api/ice-verify | jq .
```

Check that:
- `status` is `"ok"`
- `configuration.turnServersCount` > 0
- `configuration.credentialsConfigured` is `true`
- No critical `issues` listed

### Test 4: WebSocket Connection

1. Open https://callvs.com in browser
2. Open Developer Tools → Console
3. Look for: `WebSocket connected`
4. Should NOT see any mixed-content warnings

### Test 5: TURN Server (External Tool)

1. Go to https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Clear existing servers
3. Add STUN: `stun:callvs.com:3478`
4. Add TURN: `turn:callvs.com:3478` with your credentials
5. Click "Gather candidates"
6. **Must see:** "relay" type candidates (proves TURN works)
7. **Should see:** "srflx" type candidates (proves STUN works)

### Test 6: Call Flow (End-to-End)

1. Open app in Browser A (e.g., Chrome on Desktop)
2. Create identity / log in
3. Open app in Browser B (e.g., Firefox or mobile)
4. Create different identity / log in
5. Add Browser A's call address as contact in Browser B
6. Initiate call from Browser B to Browser A
7. **Verify:**
   - Browser A shows incoming call modal (rings)
   - Accept call on Browser A
   - Both browsers show video/audio
   - Connection badge shows "Direct" or "Relay"
   - Call duration timer works
   - End call works on both sides

### Test 7: Messaging (WhatsApp-style)

1. From Browser A, open chat with Browser B
2. Send text message
3. **Verify:** Message appears instantly in Browser B
4. Send from Browser B back to A
5. **Verify:** Real-time delivery both ways
6. Close Browser B tab
7. Send message from A to B
8. Reopen B
9. **Verify:** Message is delivered on reconnect

### Test 8: Video Messages

1. Open chat conversation
2. Record short video message
3. Send it
4. **Verify:** Video uploads successfully
5. **Verify:** Recipient can play video

---

## Troubleshooting

### "Ringing but no ring"

1. Check WebSocket connection in browser console
2. Verify recipient's app has WebSocket connected
3. Check server logs: `docker logs <container>`
4. Look for `[call:init]` and `[call:incoming]` logs

### "Call connects but no audio/video"

1. Run ICE verification test (Test 5)
2. If no relay candidates: Check coturn config and firewall
3. Verify `TURN_MODE=custom` in Coolify
4. Verify credentials match between app and coturn

### WebSocket keeps disconnecting

1. Check Coolify proxy timeout settings
2. Ensure WebSocket upgrade headers are being forwarded
3. App has keep-alive ping (30s interval) - should be fine

### Messages not delivering

1. Check WebSocket connection status
2. Verify database is accessible
3. Check for errors in server logs

---

## Quick Commands

```bash
# Check coturn status
systemctl status coturn

# View coturn logs
tail -f /var/log/turnserver.log

# Test TURN from command line (if turnutils installed)
turnutils_uclient -v -t -u <username> -w <password> callvs.com

# Check if ports are listening
netstat -tuln | grep -E '3478|5349'
```

---

## Support Contacts

- Coolify Docs: https://coolify.io/docs
- coturn Docs: https://github.com/coturn/coturn
- WebRTC Troubleshooting: https://webrtc.github.io/samples/

---

*Last Updated: Production Hardening Session*
