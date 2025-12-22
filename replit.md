# Call Vault (CV) - Secure P2P Video Calling

## Overview
Call Vault is a production-ready MVP for secure peer-to-peer audio and video calling using WebRTC. It enables permissioned calls without traditional phone numbers or user accounts, identifying users by cryptographic addresses derived from Ed25519 keypairs. The application features real-time signaling via WebSocket and signature verification for call authentication. Its vision includes monetization through creator profiles, paid calls, and a robust subscription-based entitlement system, targeting a broad market for secure and private communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Core Technologies
- **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS v4, Vite.
- **Backend**: Node.js, Express, TypeScript, WebSocket server (`ws` library).
- **Real-time Communication**: WebRTC with custom WebSocket signaling for offer/answer/ICE, Google STUN servers (optional TURN).
- **Cryptographic Identity**: Ed25519 keypairs (tweetnacl) for identity and authentication, client-side storage, `call:<base58(pubkey)>:<base58(random8bytes)>` address format.
- **Call Token System**: Server-issued tokens with seamless auto-recovery:
    - **Token TTL**: 10 minutes for replay protection window.
    - **Clock Skew Tolerance**: ±2 minutes (MAX_CLOCK_SKEW) for signature timestamp validation.
    - **Token Generation**: Fresh token minted ONLY when user taps Call/Video button (not on page load).
    - **Silent Retry**: 3 automatic retries with exponential backoff (200ms, 600ms, 1200ms) before showing error.
    - **Error UX**: "Connection handshake failed. Tap to retry." dialog after all retries exhausted (never "Secure session expired").
    - **Fresh Nonces**: Every call attempt uses a fresh token and nonce - no token reuse.
    - **Admin Logs**: `/api/admin/token-logs` endpoint for viewing detailed token failure logs.

### Key Features
- **Call Features**: Video/voice calls, in-call controls, call timer, connection status, incoming call modal, ICE restart, network change detection, pre-call device test (camera/microphone check).
- **Enhanced Call Reliability**: WebSocket connection validation ensures only live connections receive calls. Periodic dead connection cleanup (every 30 seconds) removes stale sockets. Connection status indicators show when reconnecting or call is connecting/ringing. Wait time extended to 30 seconds for recipient to come online after push notification.
- **STUN-First, TURN Fallback**: Prioritizes STUN for cost efficiency, falls back to TURN for paid users after 8 seconds if STUN fails. Free users are prompted to upgrade.
- **User Experience**: Mobile-first design, bottom tab navigation, contacts-first onboarding, auto-generated avatars, PWA support.
- **Monetization (Creator/Business Mode)**: Customizable creator profiles, paid calls (per-session/per-minute), call queue management, subscription tiers (Free, Pro, Business), and invite links for trial access.
- **Admin Console**: Multi-level admin system with Role-Based Access Control (RBAC), granular permissions, time-limited admin access, comped accounts, usage dashboard, system settings, promo codes, and IP blocklist.
- **Stripe Subscriptions**: Full integration for Pro and Business plans, including checkout flow, customer portal, webhook handling, and premium access gating.
- **Crypto Payments**: Optional support for USDC and ETH on Base Network, and USDC and SOL on Solana Network, requiring verified EVM or Solana wallets.
- **Free Tier Cost Shield**: Server-side enforcement of usage limits (e.g., 2 calls/day, 30 min/month, 10-min max call duration) and feature restrictions for free users.
- **Freeze Mode**: User-controlled feature to block unwanted calls, converting them to call requests, with bypass rules for emergency contacts and paid callers.
- **PWA Support**: Progressive Web App capabilities including manifest, service worker for caching, install prompt, and offline page.
- **Capacitor Mobile Wrapper**: Native iOS and Android app builds using Capacitor, sharing the same codebase as the web app. See `MOBILE_BUILD.md` for build instructions.
- **Admin Diagnostics**: Real-time system health checks via Admin Console for database, Stripe, free tier gating, RBAC, and security events.
- **Admin Bootstrap**: Secure first-time admin creation via environment variable or one-time API endpoint.
- **Admin Login**: Username/password authentication for admin console with bcrypt hashing, account lockout, session-based auth, and audit logging.
- **Payment Success Flow**: Post-payment page for verifying Stripe sessions, PWA install instructions, and automated welcome emails.
- **Enhanced Invite System**: Admin-controlled trial and comp invites with optional expiration, usage tracking, and signature verification.

### Per-Call ID Settings
- **DND (Do Not Disturb)**: Per-Call ID toggle with auto-restore after calls.
- **Call Waiting**: Per-Call ID enable/disable.
- **Voicemail Routing**: Automatic voicemail when DND is active.
- **Freeze Mode**: Per-Call ID freeze to block unwanted calls.

### Security Measures
- Ed25519 signature verification for critical actions.
- Timestamp freshness and nonce replay protection.
- Rate limiting.
- Optional biometric app lock (WebAuthn).

### TURN Server Configuration
- **TURN_MODE env var**: Controls TURN server availability
  - `public` (default): Free OpenRelay TURN for all users - TESTING ONLY, not for production
  - `custom`: Plan-gated TURN using `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` env vars
  - `off`: STUN only, no TURN for anyone
- **Metered.ca Integration**: If `METERED_APP_NAME` and `METERED_SECRET_KEY` are set, uses Metered API (takes priority over custom)
- **ICE Debug Indicator**: Call screen badge shows connection type (host/srflx/relay) with ICE details logged to console

## External Dependencies
- **WebRTC**: Google STUN servers, configurable TURN servers (OpenRelay for testing, Metered.ca or custom for production).
- **Cryptography**: `tweetnacl`, `bs58`.
- **UI/UX**: Radix UI, Tailwind CSS, Lucide React, Sonner.
- **Database**: PostgreSQL, Drizzle ORM.
- **Payment Processing**: Stripe (via `stripe-replit-sync`).
- **Email Service**: Resend or SendGrid.