# Crypto Call - Secure P2P Video Calling

## Overview

Crypto Call is a production-ready MVP for secure peer-to-peer audio and video calling using WebRTC. Users are identified by cryptographic addresses derived from Ed25519 keypairs, enabling permissioned calls without traditional phone numbers or user accounts. The application features real-time signaling via WebSocket, signature verification for call authentication, and a modern React frontend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom theme variables
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful endpoints under `/api/*` prefix
- **Real-time Communication**: WebSocket server (ws library) for signaling
- **Build Output**: Single bundled CommonJS file for production

### WebRTC Implementation
- **Signaling**: Custom WebSocket protocol for offer/answer/ICE candidate exchange
- **ICE Servers**: Google STUN servers by default, optional TURN via environment variables
- **Media**: Audio and video streams with full call controls
- **Security**: Ed25519 signature verification on call initiation

### Call Features (WhatsApp-like)
- Separate Video Call and Voice Call buttons
- In-call controls: Mute, Camera toggle, Flip camera, Speakerphone toggle, Hang up
- Call timer showing duration
- Connection status indicators (Ringing, Connecting, Connected, Reconnecting)
- Incoming call modal with Accept/Decline options
- Copy Call ID and generate new address functionality
- ICE restart and automatic reconnection on network interruption
- Network change detection (online/offline events)

### Mobile-First UX
- Bottom tab navigation: Calls, Contacts, Add, Settings
- Contacts-first onboarding for new users
- Floating Action Button (FAB) for quick actions
- Improved empty states with helpful CTAs
- Auto-generated avatars (deterministic gradients from address)
- "Private Mode" label for anonymous users
- "Call ID" terminology (user-friendly vs technical "Call Address")

### Cryptographic Identity System
- **Key Generation**: tweetnacl Ed25519 keypairs generated client-side
- **Key Storage**: Browser localStorage (private keys never leave the client)
- **Address Format**: `call:<base58(pubkey)>:<base58(random8bytes)>`
- **Call Authentication**: Signed call intent with timestamp freshness and nonce replay protection

### Data Storage
- **Client-side**: Browser localStorage for crypto identity (private keys never leave the device)
- **Server-side**: PostgreSQL database with Drizzle ORM for persistent storage
- **Database Tables**: crypto_identities, contacts, call_sessions, paid_call_tokens, call_queue_entries, creator_profiles, call_duration_records, creator_earnings

### Security Measures
- Signature verification before delivering incoming calls
- Timestamp freshness check (60-second window)
- Nonce replay protection (5-minute expiry)
- Rate limiting per caller address (10 calls per minute)
- Optional biometric app lock using WebAuthn (Face ID / Touch ID)

### PWA Support
- manifest.json with app icons and theme colors
- Service worker for offline app shell caching
- iOS Add to Home Screen meta tags
- Standalone display mode

## External Dependencies

### WebRTC Infrastructure
- Google STUN servers: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`
- Optional TURN server via environment variables: `TURN_URL`, `TURN_USER`, `TURN_PASS`

### Cryptographic Libraries
- tweetnacl: Ed25519 signature generation and verification
- bs58: Base58 encoding for addresses

### UI Framework
- Radix UI: Accessible component primitives
- Tailwind CSS: Utility-first styling
- Lucide React: Icon library
- Sonner: Toast notifications

### Development Tools
- Vite: Frontend build and development server
- tsx: TypeScript execution for development
- esbuild: Production bundling

## Phase 4: Business/Creator Mode (Monetization)

### Creator Profile
- Business Mode toggle to enable paid features
- Display name, bio, and category selection
- Timezone-aware availability
- Public profile page for sharing

### Business Hours
- Weekly schedule with per-day availability slots
- Start/end times for each day
- After-hours behavior options:
  - Send auto-message
  - Allow paid calls only
  - Block request (show in call request queue)

### Paid Calls
- **Per-session pricing**: Fixed fee for session duration
- **Per-minute pricing**: Metered billing with minimum
- Free first call option for new contacts
- Friends & family whitelist for free calls
- Currency configuration (USD default)

### Payment Integration
- Stripe integration via stripe-replit-sync
- Automatic webhook handling
- Paid call token/link generation
- Payment verification before call connection

### Call Queue
- Queue management for busy creators
- Position tracking with estimated wait times
- Priority for paid callers
- Queue notifications via WebSocket

### Files Added
- `server/stripeClient.ts`: Stripe API client with Replit connection
- `server/webhookHandlers.ts`: Stripe webhook processing
- `server/paymentStore.ts`: In-memory storage for creator profiles, pricing, and queue
- `client/src/components/CreatorModeSettings.tsx`: Business mode UI with profile, hours, and pricing editors
- `shared/types.ts`: Extended with Phase 4 types (CreatorProfile, BusinessHours, CallPricing, etc.)

### UI Entry Points (Phase 4 Activation)
- **Calls Tab**: "Create Paid Call Link" button when Business Mode enabled, Call Queue panel
- **Add Tab**: Quick Actions section with Invite Link, Paid Call Link, Share Profile cards
- **Public Profile Page**: `/u/:handle` route showing creator profile, pricing, hours, availability
- **Payment Required Screen**: Modal for paid call confirmation with pricing breakdown
- **Contact Paid Badge**: Reusable badge showing Free/Paid/Always Allowed status
- **Empty States**: Business Mode specific empty state with "Get paid for your time" CTA

## Phase 5: Production-Grade Backend (Implemented)

### Database Schema
- **crypto_identities**: Public key addresses and display names
- **contacts**: User contacts with owner/contact address relationships
- **call_sessions**: Call history with duration, status, and payment info
- **paid_call_tokens**: Payment tokens for paid calls with Stripe integration
- **call_queue_entries**: Queue management for busy creators
- **creator_profiles**: Business mode settings, pricing, and availability
- **call_duration_records**: Per-call duration tracking for billing
- **creator_earnings**: Aggregated earnings by period

### API Routes (Phase 5)
- `GET/POST/PUT /api/creator/:address` - Creator profile CRUD
- `GET/POST/PUT/DELETE /api/contacts/:ownerAddress` - Contacts management
- `GET/POST/PUT /api/calls/:address` - Call history and session management
- `GET/POST/PUT /api/paid-tokens/:creatorAddress` - Paid call token management
- `GET/POST/PUT/DELETE /api/queue/:creatorAddress` - Call queue operations
- `GET /api/earnings/:creatorAddress/stats` - Earnings statistics
- `POST /api/checkout/paid-call` - Stripe checkout session creation
- `POST /api/checkout/verify-token` - Payment token verification
- `POST /api/call-duration/start` - Start call duration tracking
- `POST /api/call-duration/end` - End call and calculate billing

### Stripe Integration
- Real checkout sessions for paid calls (test mode)
- Payment intent storage in database
- Token verification before call connection
- Per-minute billing foundation ready

### Creator Earnings Dashboard
- Total calls, minutes, and earnings statistics
- Recent call history with payment status
- Access via Settings > Earnings Dashboard

### Files Added/Modified (Phase 5)
- `shared/schema.ts`: Complete database schema with all tables
- `server/storage.ts`: DatabaseStorage implementation with Drizzle ORM
- `server/db.ts`: PostgreSQL connection pool
- `server/routes.ts`: All Phase 5 API endpoints
- `client/src/components/EarningsDashboard.tsx`: Earnings stats UI
- `client/src/components/tabs/SettingsTab.tsx`: Earnings Dashboard navigation