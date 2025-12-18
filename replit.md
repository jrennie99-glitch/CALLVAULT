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
- **Server-side**: No database required - all call state is ephemeral in WebSocket connections
- **Optional Database**: PostgreSQL with Drizzle ORM available if future features require persistence

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