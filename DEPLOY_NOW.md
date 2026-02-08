# 🚨 CallVault - DEPLOY THESE FIXES NOW

## What I Fixed

### ✅ Bug Fix #1: Database Null Check (CRITICAL)
**Problem:** Messages fail if database is not connected  
**Fix:** Added check in `storage.storeMessageWithSeq()` to handle null database

### ✅ Bug Fix #2: Better Error Logging
**Problem:** Can't tell why messages/calls fail  
**Fix:** Added detailed error messages for signature failures, clock skew, database errors

### ✅ New: Setup Scripts
- `fix-everything.js` - Run this ON YOUR SERVER to fix everything
- `test-connection.js` - Test if fixes worked

---

## 🚀 DEPLOY INSTRUCTIONS

### Step 1: Pull Code on Your Server

SSH to your Hetzner server:
```bash
cd /path/to/callvault
git pull origin main
```

### Step 2: Run the Fix Script

```bash
# Set your database URL
export DATABASE_URL=postgresql://user:password@localhost:5432/callvault

# Run the fix script
node fix-everything.js
```

This will:
- ✅ Create all database tables
- ✅ Check your configuration
- ✅ Generate VAPID keys for push notifications

### Step 3: Copy VAPID Keys

The script will output something like:
```
╔════════════════════════════════════════════════╗
║  ADD THESE TO YOUR COOLIFY ENVIRONMENT VARS:   ║
╚════════════════════════════════════════════════╝

VAPID_PUBLIC_KEY=BLCJt9jV... (long string)
VAPID_PRIVATE_KEY=your_private_key... (long string)
VAPID_SUBJECT=mailto:admin@callvault.app
```

**Copy these to Coolify immediately!**

### Step 4: Configure TURN (for calls to work)

In Coolify environment variables, add:
```
TURN_MODE=custom
TURN_URLS=turn:callvs.com:3478,turn:callvs.com:3478?transport=tcp
TURN_USERNAME=your_coturn_username
TURN_CREDENTIAL=your_coturn_password
```

### Step 5: Restart Server

```bash
# If using PM2:
pm2 restart callvault

# If using Coolify:
# Go to Coolify dashboard → Click Restart
```

### Step 6: Test

```bash
# Test WebSocket connection
node test-connection.js wss://callvs.com/ws
```

---

## 🔧 If You Don't Have Database Tables Yet

Run this to create all tables:
```bash
export DATABASE_URL=your_database_url
node setup-database.js
```

---

## 🧪 Testing Checklist

After deploying:

1. **Test texts:**
   - Open app in 2 browsers
   - Register 2 users
   - Send message from A to B
   - ✅ Should show "delivered"

2. **Test calls:**
   - Call from A to B
   - ✅ Should ring and connect

3. **Test push notifications:**
   - Close browser B
   - Send message from A
   - ✅ Browser B should get notification

---

## 🐛 Still Broken?

### Check server logs:
```bash
# PM2:
pm2 logs callvault

# Coolify:
# Check logs in Coolify dashboard
```

### Run diagnostics:
```bash
curl https://callvs.com/api/health
curl https://callvs.com/api/diagnostics
```

### Common issues:

**"Database not available"**
- Check DATABASE_URL is set correctly
- Run: `node setup-database.js`

**"Invalid signature"**
- Device clock is wrong (must be within 5 minutes of server)
- Check: `date` on server vs device

**"Calls don't connect"**
- TURN not configured (set TURN_MODE=custom)
- Firewall blocking ports 3478, 5349
- Coturn not running

---

## 📞 Make Repo Private Again

After deploying:
1. Go to GitHub repo settings
2. Change visibility to Private
3. Done

---

## Summary

**What was broken:**
- Database null pointer crash
- Missing error logging
- No setup automation

**What I fixed:**
- ✅ Added null check for database
- ✅ Added detailed error logging
- ✅ Created setup scripts
- ✅ Added diagnostics

**You need to:**
1. Pull code
2. Run `node fix-everything.js`
3. Add VAPID keys to Coolify
4. Configure TURN
5. Restart
6. Test

**Then make repo private.**

---

Need help? Send me:
- Output of `node fix-everything.js`
- Server logs after restart
- Results of `node test-connection.js`
