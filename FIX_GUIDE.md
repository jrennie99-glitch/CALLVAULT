# CallVault Fix Guide - From Broken to Working

## Your Symptoms
- ✅ Text messages worked before (on Replit)
- ✅ Called yourself successfully
- ✅ Called someone else once (it worked!)
- ❌ After switching platforms (Replit → Emergent → Replit → Coolify): Nothing works
- ❌ Text messages don't work
- ❌ Calls don't work

## Root Cause

**Database connection was lost during platform migration.**

When you moved from Replit to Coolify, the `DATABASE_URL` environment variable likely wasn't transferred. Without it:
- Server starts with **in-memory storage**
- All data (messages, users, call history) is **lost on every restart**
- Messages can't be delivered between users
- Nothing persists

## The Fix (Step by Step)

### Step 1: Create PostgreSQL Database in Coolify

1. Go to your **Coolify Dashboard**
2. Click **"New Resource"** → **"Database"** → **"PostgreSQL"**
3. Name it: `callvault-db`
4. Save it
5. Wait for it to be created (green status)
6. **Copy the connection string** - it looks like:
   ```
   postgresql://user:password@callvault-db:5432/callvault
   ```

### Step 2: Set Environment Variables in Coolify

Go to your **CallVault application** in Coolify → **Environment Variables**:

**CRITICAL - Set These:**

```env
# 1. Database (THE FIX!)
DATABASE_URL=postgresql://... (paste from Step 1)

# 2. Basic Settings
NODE_ENV=production
PORT=3000
TRUST_PROXY=true
PUBLIC_URL=https://your-domain.com

# 3. TURN Server (for calls to work)
TURN_MODE=custom
TURN_URLS=turn:your-server.com:3478
TURN_USERNAME=callvault
TURN_CREDENTIAL=your-secret-password

# 4. STUN (backup for WebRTC)
STUN_URLS=stun:stun.l.google.com:19302

# 5. Push Notifications (optional but recommended)
VAPID_PUBLIC_KEY=your-key-here
VAPID_PRIVATE_KEY=your-key-here
```

### Step 3: Deploy

1. Click **"Deploy"** in Coolify
2. Wait for build to complete
3. Check logs for: "✓ Database connection verified"

### Step 4: Initialize Database Schema

After first deploy with database, run:

```bash
# SSH into your Coolify server or use Coolify's terminal
cd /path/to/callvault
npm run db:push
```

Or execute in Coolify:
1. Go to your app in Coolify
2. Click **"Execute Command"**
3. Run: `npm run db:push`

### Step 5: Test

Run the diagnostic script on your server:

```bash
bash diagnose.sh
```

Or test via curl:
```bash
# Health check
curl https://your-domain.com/health

# Full diagnostics
curl https://your-domain.com/api/diagnostics

# TURN config
curl https://your-domain.com/api/turn-config
```

## What Was Wrong (Technical Details)

### The Database Issue

**Before (Replit):**
- Replit provides a PostgreSQL database automatically
- `DATABASE_URL` was set by Replit
- Data persisted between sessions

**After (Coolify without DB):**
- No `DATABASE_URL` set
- App fell back to in-memory storage
- Every deploy/restart = data wiped
- Messages sent to "nowhere"

### The TURN Issue (for calls)

**TURN_MODE=public** uses free OpenRelay servers:
- Often blocked by corporate firewalls
- Rate limited
- Unreliable
- That's why your one call worked, but others didn't

**TURN_MODE=custom** with coturn:
- Your own TURN server
- Reliable
- Works everywhere
- Required for production

## Quick Self-Diagnose

Run this to check your current setup:

```bash
# SSH to your Coolify server
docker exec -it <callvault-container-id> /bin/sh

# Check env vars
env | grep -E "DATABASE_URL|TURN_MODE|NODE_ENV"

# If DATABASE_URL is empty, that's your problem!
```

## Common Mistakes to Avoid

1. **Don't skip the database** - CallVault needs PostgreSQL to work
2. **Don't use TURN_MODE=public** in production - set up coturn
3. **Don't forget `npm run db:push`** after first database connection
4. **Don't use the same TURN credentials** for different apps (security risk)

## If You're Stuck

**Check these in order:**

1. **Is DATABASE_URL set?**
   ```bash
   curl https://your-domain.com/api/diagnostics | grep database
   ```

2. **Is database connected?**
   ```bash
   # Should show "✓ Database connection verified" in logs
   ```

3. **Can you see the UI?**
   ```bash
   curl https://your-domain.com/  # Should return HTML, not error
   ```

4. **Are WebSockets working?**
   - Open browser console
   - Look for "WebSocket connected" message
   - Check for errors

## Next Steps After Fix

Once database is connected:
1. Create new accounts (old ones were lost)
2. Add contacts
3. Test messaging
4. Set up coturn for calls
5. Generate VAPID keys for push notifications

## Support

If still stuck, run the diagnostic script and share the output:
```bash
bash diagnose.sh 2>&1
```
