# Call Vault (CV) - Secure P2P Video Calling

## Overview
Call Vault is a production-ready MVP for secure peer-to-peer audio and video calling using WebRTC. It enables permissioned calls without traditional phone numbers or user accounts, identifying users by cryptographic addresses derived from Ed25519 keypairs. The application features real-time signaling via WebSocket, signature verification for call authentication, and a modern React frontend. Its vision includes monetization through creator profiles, paid calls, and a robust subscription-based entitlement system, targeting a broad market for secure and private communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Technologies
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack React Query for state, shadcn/ui (Radix UI), Tailwind CSS v4, Vite.
- **Backend**: Node.js, Express, TypeScript, WebSocket server (ws library) for signaling, compiled with tsx/esbuild.
- **Real-time Communication**: WebRTC with custom WebSocket signaling for offer/answer/ICE, Google STUN servers (optional TURN).
- **Cryptographic Identity**: Ed25519 keypairs (tweetnacl) generated and stored client-side (localStorage), `call:<base58(pubkey)>:<base58(random8bytes)>` address format, signature verification for call authentication, timestamp freshness, and nonce replay protection.

### Key Features
- **Call Features**: Video/voice calls, in-call controls (mute, camera, speakerphone), call timer, connection status, incoming call modal, ICE restart, network change detection.
- **User Experience**: Mobile-first design, bottom tab navigation, contacts-first onboarding, auto-generated avatars, PWA support.
- **Monetization (Creator/Business Mode)**:
    - **Creator Profiles**: Customizable public profiles, availability settings, time-zone aware scheduling.
    - **Paid Calls**: Per-session or per-minute pricing, free first calls, friends & family whitelist.
    - **Call Queue**: Management for busy creators, priority for paid callers.
    - **Subscription Tiers**: Free, Pro ($9/mo), Business ($29/mo) with feature gating.
    - **Invite Links**: Admin-generated codes for influencer onboarding with trial access.
- **Admin Console**: Advanced multi-level admin system with comprehensive RBAC:
    - **Role Hierarchy**: `ultra_god_admin/founder` > `super_admin` > `admin` > `support` > `user` with cascading permissions.
    - **Granular Permissions**: 20+ individual permissions covering users, access, admins, billing, security, audit, system, rate limits, and blocklist management.
    - **Permission Categories**: `users.*` (read/write/suspend/impersonate/delete), `access.*` (grant/revoke/trials), `admins.*` (read/manage/create), `billing.*` (read/write/refund), `security.*` (read/write/2fa), `audit.*` (read/export), `system.*` (settings/maintenance), `rate_limits.manage`, `blocklist.manage`.
    - **Admin Expiration**: Time-limited admin access with automatic permission revocation.
    - **Custom Permissions**: Per-user permission overrides beyond role defaults.
    - **Admin Sessions**: Tracked sessions with IP/user agent logging and revocation support.
    - **Comped Accounts**: Toggle `isComped` flag for perpetual Pro access without billing (useful for friends, family, or VIPs).
    - **Usage Dashboard**: Real-time view of active calls, calls today, minutes this month, relay calls 24h, estimated TURN costs, and per-user activity table.
    - **System Settings**: Dynamic configuration stored in database for runtime adjustments.
    - **Promo Codes**: Admin-generated discount/trial codes with usage limits and expiration.
    - **IP Blocklist**: Block malicious IPs with reason tracking and expiration.
    - **Key Files**: `server/rbac.ts` (RBAC service), admin routes in `server/routes.ts`, `AdminConsole.tsx` with Admins tab.
- **Stripe Subscriptions (Phase 9)**: Full subscription management integration:
    - **Checkout Flow**: Stripe Checkout sessions for Pro ($9/mo) and Business ($29/mo) plans.
    - **Customer Portal**: Users can manage billing, update payment methods, and cancel subscriptions.
    - **Webhook Handling**: Automatic status updates via stripe-replit-sync with signature verification.
    - **Premium Access Gating**: `checkPremiumAccess()` checks subscription status first, then trial access.
    - **UI Integration**: Settings page shows current plan, trial status, and upgrade/billing management buttons.
    - **Admin Visibility**: Plan badges displayed in Admin Console for each user.
    - **Price IDs**: Configured via `STRIPE_PRO_PRICE_ID` and `STRIPE_BUSINESS_PRICE_ID` environment variables.
- **Crypto Payments (Phase 8)**: Optional alternative payment methods supporting multiple blockchains:
    - **Base Network**: USDC and ETH payments. Requires verified EVM wallet. Uses ethers.js for verification. Controlled via `ENABLE_CRYPTO_PAYMENTS` env var.
    - **Solana Network**: USDC and SOL payments. Requires verified Solana wallet. Uses @solana/web3.js for verification. Controlled via `ENABLE_SOLANA_PAYMENTS` env var. Supports mainnet-beta and devnet clusters via `SOLANA_CLUSTER` env var.
    - **Common**: 20-minute invoice expiration, on-chain transaction verification, chain-specific explorer links (BaseScan/Solscan), price fetching from CoinGecko with 5-minute cache.
    - **Limitation**: Users can only have one verified wallet at a time (either EVM or Solana, not both).
- **Free Tier Cost Shield (Phase 10)**: Server-side enforcement to prevent abuse and manage costs for free users:
    - **Three Tier System**: `free` (limited), `paid` (Pro/Business/active trial - no limits), `admin` (founders/admins bypass all limits).
    - **Usage Limits**: 2 calls/day, 30 minutes/month, 5 attempts/hour for free tier users.
    - **Call Duration**: 10-minute max per call (5-minute if relay penalty active).
    - **Mutual Contact Requirement**: Free users can only call/receive calls from mutually approved contacts.
    - **Server-side Monitoring**: 15-second heartbeat intervals, automatic termination of stale calls after 45 seconds.
    - **Relay Usage Penalty**: 7-day duration reduction (10→5 min) after 2 relay calls in 24h.
    - **Feature Restrictions**: Free users cannot use: recording, transcription, media upload, analytics export, background persistence, group calls, external links.
    - **Admin Tier Management**: Endpoint to override user tiers via `/api/admin/users/:address/tier`.
    - **Database Tables**: `usage_counters` for tracking limits, `active_calls` for real-time monitoring.
    - **Key Files**: `server/freeTierShield.ts` (enforcement logic), integrated into WebSocket call flow in `server/routes.ts`.
- **Freeze Mode (Phase 11)**: User-controlled call silencing feature to block unwanted calls:
    - **Purpose**: Allows users to silence calls from unknown/unapproved contacts while allowing emergency contacts through.
    - **Server-side Enforcement**: When Freeze Mode is enabled, unapproved calls are converted to call requests instead of ringing directly.
    - **Bypass Rules**: Always-allowed contacts, paid callers, and pre-approved contacts can still ring through.
    - **OS Guided Setup**: Platform-specific modal guides users to enable Do Not Disturb while allowing app notifications (iOS, Android, Desktop).
    - **Always Allowed Contacts**: Per-contact toggle to mark emergency contacts who can always reach you.
    - **Schema Fields**: `freezeMode`, `freezeModeSetupCompleted` on users table; `alwaysAllowed` on contacts table.
    - **API Endpoints**: `/api/freeze-mode/:address` (GET/PUT), `/api/freeze-mode/:address/setup-complete`, `/api/contacts/:owner/always-allowed`, `/api/contacts/:owner/:contact/always-allowed`.
    - **Key Files**: `client/src/components/FreezeModeSetupModal.tsx`, integration in SettingsTab and ContactsTab.

- **PWA Support (Phase 12)**: Progressive Web App for mobile installation:
    - **Manifest**: `manifest.json` with app name, icons, theme colors, and standalone display mode.
    - **Service Worker**: `sw.js` caches static assets, offline fallback page, network-first for API/WebSocket.
    - **Install Prompt**: `InstallPrompt.tsx` component shows install banner when app is installable.
    - **Offline Page**: `/offline.html` displays friendly message when user is offline.
    - **Meta Tags**: Apple touch icon, status bar style, viewport configured in `index.html`.
- **Admin Diagnostics**: System health monitoring in Admin Console:
    - **Diagnostics Tab**: Real-time system status checks accessible via "Health" tab in Admin Console.
    - **Checks**: Database connectivity, Stripe configuration, free tier gating status, RBAC system, active calls, security events.
    - **API Endpoint**: `/api/admin/diagnostics` (requires `system.settings` permission).
- **Admin Bootstrap**: First-time admin creation:
    - **Env Var Method**: Set `FOUNDER_ADDRESS` environment variable with user's call address.
    - **API Method**: POST `/api/bootstrap-admin` with `CV_BOOTSTRAP_SECRET` for one-time admin creation.
    - **Safety**: Bootstrap endpoint can only be used once and only when no admin exists.
- **Admin Login (Phase 14)**: Username/password authentication for admin console:
    - **Login Page**: `/admin/login` page with username/password form.
    - **Credential Setup**: Admins can set up username/password from Account tab in Admin Console (requires cryptographic signature).
    - **Security Features**: bcrypt hashing (12 rounds), account lockout after 5 failed attempts (15-minute), session-based authentication.
    - **Password Management**: Change password from Account tab with current password verification.
    - **Dual Authentication**: Admins can access console via cryptographic keys OR username/password.
    - **Audit Logging**: All login attempts, credential creation, and password changes are logged.
    - **API Endpoints**: `/api/admin/login`, `/api/admin/logout`, `/api/admin/session`, `/api/admin/setup-credentials`, `/api/admin/change-password`.
    - **Key Files**: `client/src/pages/admin-login.tsx`, Account tab in `AdminConsole.tsx`.
- **Payment Success Flow (Phase 13)**: Post-payment user onboarding:
    - **Success Page**: `/success` page verifies Stripe session and shows platform-specific PWA install instructions.
    - **Session Verification**: `/api/billing/verify-session` endpoint validates Stripe checkout sessions.
    - **Welcome Emails**: Automatic "Access Ready" emails sent via Resend or SendGrid after payment verification.
    - **Key Files**: `client/src/pages/success.tsx`, `server/email.ts`.
- **Enhanced Invite System**: Admin-controlled trial and comp invites:
    - **Invite Types**: `trial` (limited access with time/minutes) and `comp` (full plan access without billing).
    - **Link Expiration**: Optional expiration date for invite links.
    - **Usage Tracking**: Max uses, current uses, and per-user redemption tracking.
    - **Signature Verification**: Invite creation requires cryptographic signature verification.
    - **Admin UI**: Invites tab in Admin Console for creating/managing invites with type selector.

### Security Measures
- Ed25519 signature verification for call initiation and admin actions.
- Timestamp freshness (60-second window) and nonce replay protection (5-minute expiry).
- Rate limiting (10 calls/min per caller).
- Optional biometric app lock (WebAuthn).

## Environment Variables
- `FOUNDER_ADDRESS`: Call address to automatically promote to founder role on registration.
- `CV_BOOTSTRAP_SECRET`: Secret for one-time admin bootstrap via API.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe API credentials.
- `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`: Stripe price IDs for subscription plans.
- `ENABLE_CRYPTO_PAYMENTS`: Enable Base network crypto payments.
- `ENABLE_SOLANA_PAYMENTS`: Enable Solana network crypto payments.
- `SOLANA_CLUSTER`: Solana cluster (mainnet-beta or devnet).
- `RESEND_API_KEY` or `SENDGRID_API_KEY`: Email service API key for welcome emails.
- `EMAIL_FROM`: Sender address for emails (default: noreply@callvault.app).
- `APP_URL`: Base URL for the app (used in emails).

## External Dependencies
- **WebRTC**: Google STUN servers, optional TURN server.
- **Cryptography**: `tweetnacl` (Ed25519), `bs58` (Base58 encoding).
- **UI/UX**: Radix UI, Tailwind CSS, Lucide React (icons), Sonner (toast notifications).
- **Database**: PostgreSQL, Drizzle ORM.
- **Payment Processing**: Stripe (via `stripe-replit-sync`).