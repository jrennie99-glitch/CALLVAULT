# CallVault Complete Setup Configuration
# Generated: 2026-02-08
# TURN Server: 82.180.163.21 (superclaw)

========================================
STEP 1: CREATE POSTGRESQL DATABASE IN COOLIFY
========================================

1. Go to Coolify Dashboard
2. Click "New Resource" → "Database" → "PostgreSQL"
3. Name: callvault-db
4. Save and wait for green status
5. COPY the connection string (looks like):
   postgresql://user:password@callvault-db:5432/callvault

========================================
STEP 2: SET THESE ENVIRONMENT VARIABLES IN COOLIFY
========================================

Copy and paste ALL of these into your CallVault app's Environment Variables:

--- CRITICAL ---
NODE_ENV=production
PORT=3000
TRUST_PROXY=true
PUBLIC_URL=https://callvs.com

--- DATABASE (PASTE YOUR COOLIFY DB URL HERE) ---
DATABASE_URL=postgresql://user:password@callvault-db:5432/callvault

--- TURN SERVER (Configured on 82.180.163.21) ---
TURN_MODE=custom
TURN_URLS=turn:82.180.163.21:3478,turn:82.180.163.21:3478?transport=tcp
TURN_USERNAME=callvault
TURN_CREDENTIAL=CV_TURN_Pass_2026!

--- STUN (Backup) ---
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302

--- PUSH NOTIFICATIONS ---
VAPID_PUBLIC_KEY=BMFJRP-tl9-smFPWMTEWXwhZx9p0thKy1VeVvupnQXVLHBYzRvNmj_kmNDANMra4YLD1MzzwYdz_EmGj2R5v1sA
VAPID_PRIVATE_KEY=9nnko3zHlWjg3yQXPMZjQyf-0EoFu2XoffH77xX4Eus
VAPID_SUBJECT=mailto:admin@callvs.com

--- OPTIONAL: FCM for Android ---
# FCM_SERVER_KEY=your_firebase_key_here

========================================
STEP 3: DEPLOY & INITIALIZE DATABASE
========================================

1. Click "Deploy" in Coolify
2. Wait for build to complete (green checkmark)
3. Open Coolify's "Execute Command" terminal
4. Run: npm run db:push
5. Wait for schema to be created

========================================
STEP 4: VERIFY EVERYTHING WORKS
========================================

Test these URLs in your browser:

✅ Health Check:
   https://callvs.com/health
   Should return: {"ok":true}

✅ Full Diagnostics:
   https://callvs.com/api/diagnostics
   Should show database: connected, turn: configured

✅ TURN Config:
   https://callvs.com/api/turn-config
   Should return TURN server details

✅ WebSocket Test:
   Open browser console on callvs.com
   Look for: "WebSocket connected"

========================================
WHAT I SET UP FOR YOU
========================================

✅ TURN Server (coturn) on 82.180.163.21
   - Running on port 3478
   - Username: callvault
   - Password: CV_TURN_Pass_2026!
   - External IP: 82.180.163.21
   - Location: /docker/coturn/

✅ VAPID Keys Generated
   - For push notifications
   - Keys saved above

✅ Configuration Values
   - All values ready to paste into Coolify

========================================
AFTER DEPLOYMENT - TEST CALLS
========================================

1. Open callvs.com in TWO different browsers
   (e.g., Chrome and Firefox, or Chrome + Incognito)

2. Create two different accounts (or use existing)

3. Add each other as contacts

4. Test messaging first (should work immediately)

5. Test calling:
   - One person clicks "Call"
   - Other person should see incoming call
   - Accept and verify audio/video works

========================================
TROUBLESHOOTING
========================================

❌ Database connection failed?
   → Check DATABASE_URL is correct in Coolify
   → Run: npm run db:push again

❌ Calls not connecting?
   → Check TURN_URLS has correct IP (82.180.163.21)
   → Verify coturn is running: docker ps | grep coturn
   → Check firewall: ufw allow 3478

❌ Push notifications not working?
   → VAPID keys must be set BEFORE deploying
   → Users need to enable notifications in browser

❌ WebSocket not connecting?
   → Check TRUST_PROXY=true is set
   → Verify no mixed content (HTTPS vs HTTP)

========================================
FILES CREATED ON SUPERCLAW (82.180.163.21)
========================================

/docker/coturn/
├── docker-compose.yml
└── turnserver.conf

Run: cd /docker/coturn && docker compose logs -f

========================================
IMPORTANT NOTES
========================================

1. The TURN server is on 82.180.163.21 (superclaw)
   - This is a different server from Coolify
   - That's OK - TURN can be anywhere on the internet
   - As long as the IP in TURN_URLS is correct

2. Database is on Coolify
   - Must create it in Coolify dashboard
   - I cannot do this remotely - you must do it

3. After first deploy with database:
   - Run npm run db:push ONCE
   - This creates all tables
   - Only needed after first database setup

4. All data will persist now:
   - User accounts
   - Messages
   - Call history
   - Contacts

========================================
NEXT STEPS
========================================

1. ⬜ Create PostgreSQL database in Coolify
2. ⬜ Paste environment variables above
3. ⬜ Deploy
4. ⬜ Run npm run db:push
5. ⬜ Test messaging
6. ⬜ Test calling
7. ⬜ Done!

========================================
