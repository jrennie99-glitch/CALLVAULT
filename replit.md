# Crypto Call - Secure P2P Video Calling

## Overview
Crypto Call is a production-ready MVP for secure peer-to-peer audio and video calling using WebRTC. It enables permissioned calls without traditional phone numbers or user accounts, identifying users by cryptographic addresses derived from Ed25519 keypairs. The application features real-time signaling via WebSocket, signature verification for call authentication, and a modern React frontend. Its vision includes monetization through creator profiles, paid calls, and a robust subscription-based entitlement system, targeting a broad market for secure and private communication.

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
- **Admin Console**: Role-Based Access Control (RBAC) for `founder`, `admin`, `user` roles, user management (enable/disable, roles), free trial system (time-based/usage-based), audit logs, impersonation.

### Security Measures
- Ed25519 signature verification for call initiation and admin actions.
- Timestamp freshness (60-second window) and nonce replay protection (5-minute expiry).
- Rate limiting (10 calls/min per caller).
- Optional biometric app lock (WebAuthn).

## External Dependencies
- **WebRTC**: Google STUN servers, optional TURN server.
- **Cryptography**: `tweetnacl` (Ed25519), `bs58` (Base58 encoding).
- **UI/UX**: Radix UI, Tailwind CSS, Lucide React (icons), Sonner (toast notifications).
- **Database**: PostgreSQL, Drizzle ORM.
- **Payment Processing**: Stripe (via `stripe-replit-sync`).