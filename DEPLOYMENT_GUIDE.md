# CallVault Fixes - Deployment Guide

## ✅ What's Been Fixed

### 1. **Message Sending (Texts)**
**Problem:** Messages stopped working - likely due to clock skew or database issues

**Fixes Applied:**
- Added detailed validation for message structure
- Better error logging for signature verification failures
- Database error logging with specific error codes
- Clock skew detection and logging

### 2. **Call Diagnostics**
**Problem:** Calls don't work, no clear error messages

**Fixes Applied:**
- Startup configuration check logs TURN status
- Better WebRTC error handling
- `/api/diagnostics` endpoint for troubleshooting

### 3. **WebSocket Logging**
**Problem:** Hard to debug connection issues

**Fixes Applied:**
- Connection logging with client IP
- Message type logging
- Connection count tracking
- Better disconnect reason logging

---

## 🚀 Deployment Steps

### Step 1: Pull the Code

On your server:
```bash
cd /path/to/callvault
git pull origin main
```

Or copy files manually if not using git on server.

### Step 2: Install Dependencies (if needed)
```bash
npm install
```

### Step 3: Restart the Server

**If using Coolify:**
- Go to your Coolify dashboard
- Find the CallVault service
- Click "Restart"

**If using PM2:**
```bash
pm2 restart callvault
```

**If using systemd:**
```bash
sudo systemctl restart callvault
```

**If running manually:**
```bash
# Stop existing process (Ctrl+C or kill)
# Then:
npm run start
```

### Step 4: Check the Logs

After restart, check the logs for the startup diagnostic:

```bash
# If using Coolify, logs are in the dashboard
# If using PM2:
pm2 logs callvault

# If using systemd:
sudo journalctl -u callvault -f
```

You should see output like:
```
🔍 Startup Configuration Check:
================================================
Database: ✓ Configured
TURN Mode: public
  ⚠️  Using public OpenRelay (unreliable for production)
     Set TURN_MODE=custom with your own TURN server
Push Notifications: ✗ VAPID keys not set
  ⚠️  Offline users won't receive call/message notifications
     Generate keys: npx web-push generate-vapid-keys
Port: 3000
================================================
```

### Step 5: Test the Fixes

**Test 1: Health Check**
```bash
curl https://callvs.com/api/health
curl https://callvs.com/api/diagnostics
```

**Test 2: WebSocket Connection**
```bash
# On your local machine:
cd callvault
npm install ws
node test-connection.js wss://callvs.com/ws
```

**Test 3: Send a Message**
1. Open the app in two browsers
2. Register two different users
3. Add each other as contacts
4. Try sending a message
5. Check server logs for any errors

---

## 🔧 Still Need to Configure

These fixes improve logging and error handling, but you still need to configure:

### 1. TURN Server (for calls to work)

In Coolify environment variables:
```
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=your_coturn_username
TURN_CREDENTIAL=your_coturn_password
STUN_URLS=stun:callvs.com:3478,stun:stun.l.google.com:19302
```

Also ensure your coturn server is running and firewall is open.

### 2. VAPID Keys (for push notifications)

Generate keys:
```bash
npx web-push generate-vapid-keys
```

Add to Coolify:
```
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:admin@callvs.com
```

### 3. Database (if not already configured)
```
DATABASE_URL=postgresql://user:password@host:port/database
```

---

## 🐛 Debugging Issues

### If messages still don't work:

1. **Check server logs** for specific error messages
2. **Check browser console** for WebSocket errors
3. **Check device clock** - must be within 5 minutes of server time
4. **Test with the diagnostic script:**
   ```bash
   node test-connection.js wss://callvs.com/ws
   ```

### If calls still don't work:

1. **Check TURN configuration:**
   ```bash
   curl https://callvs.com/api/turn-config
   ```
   Should return TURN servers, not just STUN.

2. **Test TURN server:**
   - Go to https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   - Add your TURN server with credentials
   - Should see "relay" candidates

3. **Check firewall on Hetzner:**
   ```bash
   sudo ufw status
   # Should show ports 3478, 5349, 49152-65535 open
   ```

---

## 📝 Make Repo Private Again

Once you've deployed and verified the fixes work:

1. Go to GitHub repo settings
2. Click "Change visibility"
3. Select "Private"
4. Confirm

---

## ❓ Need More Help?

If you're still having issues after deploying:

1. Run the diagnostics endpoint:
   ```bash
   curl https://callvs.com/api/diagnostics
   ```

2. Send me the output of:
   - Startup logs (the configuration check)
   - Any error messages from browser console
   - Results from test-connection.js

3. Check specific endpoints:
   - `/api/health` - Basic health
   - `/api/diagnostics` - Full configuration
   - `/api/turn-config` - TURN servers
   - `/api/ice-verify` - ICE/TURN verification
