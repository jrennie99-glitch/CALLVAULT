import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import nacl from "tweetnacl";
import bs58 from "bs58";
import bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import webpush from "web-push";
import type { WSMessage, SignedCallIntent, CallIntent, SignedMessage, Message, Conversation, CallPolicy, ContactOverride, CallPass, BlockedUser, RoutingRule, WalletVerification, CallRequest, GroupCallRoom, GroupCallParticipant } from "@shared/types";
import * as messageStore from "./messageStore";
import * as policyStore from "./policyStore";
import { storage, db } from "./storage";
import { teamMembers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { FreeTierShield, FREE_TIER_LIMITS, type ShieldErrorCode } from "./freeTierShield";
import { sendEmail, generateWelcomeEmail, generateTrialInviteEmail } from "./email";
import { getEffectiveEntitlements } from "./entitlements";

// VAPID keys for push notifications - generate once and store in env vars
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@callvault.app';

// Initialize web-push if VAPID keys are configured
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('Web Push configured with VAPID keys');
} else {
  console.log('Web Push not configured - set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push notifications');
}

// FCM Server Key for native push (set via environment variable)
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';

// Helper to send FCM push notification to native devices
async function sendFcmPushNotification(
  userAddress: string,
  payload: { 
    type: string; 
    title: string; 
    body: string; 
    from_address?: string; 
    sessionId?: string;
    callType?: string;
    url?: string;
  }
): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    return false;
  }
  
  try {
    const deviceTokens = await storage.getDevicePushTokens(userAddress);
    if (deviceTokens.length === 0) {
      return false;
    }
    
    let sent = false;
    for (const device of deviceTokens) {
      if (device.platform !== 'android') continue; // FCM is for Android
      
      try {
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${FCM_SERVER_KEY}`,
          },
          body: JSON.stringify({
            to: device.token,
            priority: 'high',
            notification: {
              title: payload.title,
              body: payload.body,
              channel_id: 'incoming_calls',
              sound: 'default',
            },
            data: {
              type: payload.type,
              from_address: payload.from_address || '',
              sessionId: payload.sessionId || '',
              callType: payload.callType || 'audio',
              url: payload.url || `/app?incoming=1`,
            },
          }),
        });
        
        if (response.ok) {
          await storage.updateDevicePushTokenStatus(device.token, true);
          sent = true;
          console.log(`FCM push sent to ${userAddress} (Android)`);
        } else {
          const errorText = await response.text();
          await storage.updateDevicePushTokenStatus(device.token, false, errorText);
          console.error(`FCM push failed: ${errorText}`);
        }
      } catch (err: any) {
        await storage.updateDevicePushTokenStatus(device.token, false, err.message);
        console.error('FCM push error:', err.message);
      }
    }
    return sent;
  } catch (error) {
    console.error('Error sending FCM push:', error);
    return false;
  }
}

// Helper to send push notification (web + native)
async function sendPushNotification(
  userAddress: string, 
  payload: { type: string; title: string; body: string; from_address?: string; convo_id?: string; tag?: string; sessionId?: string; callType?: string; url?: string }
): Promise<boolean> {
  let webPushSent = false;
  let nativePushSent = false;
  
  // Try web push
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      const subscriptions = await storage.getPushSubscriptions(userAddress);
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dhKey,
                auth: sub.authKey
              }
            },
            JSON.stringify(payload)
          );
          webPushSent = true;
          console.log(`Web push notification sent to ${userAddress}`);
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await storage.deletePushSubscription(userAddress, sub.endpoint);
            console.log(`Removed invalid push subscription for ${userAddress}`);
          } else {
            console.error('Web push notification error:', err.message);
          }
        }
      }
    } catch (error) {
      console.error('Error sending web push notification:', error);
    }
  }
  
  // Try native FCM push
  nativePushSent = await sendFcmPushNotification(userAddress, {
    type: payload.type,
    title: payload.title,
    body: payload.body,
    from_address: payload.from_address,
    sessionId: payload.sessionId,
    callType: payload.callType,
    url: payload.url,
  });
  
  return webPushSent || nativePushSent;
}

const BCRYPT_SALT_ROUNDS = 12;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

interface ClientConnection {
  ws: WebSocket;
  address: string;
  pubkey?: string;
  connectionId: string; // Unique ID for each connection
}

// Multi-device support: Store array of connections per address
const connections = new Map<string, ClientConnection[]>();

// Helper function to add a connection for an address
function addConnection(address: string, conn: ClientConnection) {
  const existing = connections.get(address) || [];
  existing.push(conn);
  connections.set(address, existing);
}

// Helper function to remove a specific connection
function removeConnection(address: string, connectionId: string) {
  const existing = connections.get(address);
  if (!existing) return;
  const filtered = existing.filter(c => c.connectionId !== connectionId);
  if (filtered.length === 0) {
    connections.delete(address);
  } else {
    connections.set(address, filtered);
  }
}

// Helper to get first ALIVE connection for an address
// Verifies the WebSocket is actually open before returning
function getConnection(address: string): ClientConnection | undefined {
  const conns = connections.get(address);
  if (!conns) return undefined;
  
  // Find first connection with an open socket
  for (const conn of conns) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      return conn;
    }
  }
  
  // No open connections found - clean up dead ones
  const openConns = conns.filter(c => c.ws.readyState === WebSocket.OPEN);
  if (openConns.length === 0) {
    connections.delete(address);
    console.log(`[cleanup] Removed all dead connections for ${address.slice(0, 20)}...`);
  } else {
    connections.set(address, openConns);
  }
  
  return undefined;
}

// Get all ALIVE connections for an address (for multi-device support)
function getAllConnections(address: string): ClientConnection[] {
  const conns = connections.get(address);
  if (!conns) return [];
  
  // Filter to only open connections
  const openConns = conns.filter(c => c.ws.readyState === WebSocket.OPEN);
  
  // Update stored connections if we filtered any dead ones
  if (openConns.length !== conns.length) {
    if (openConns.length === 0) {
      connections.delete(address);
    } else {
      connections.set(address, openConns);
    }
  }
  
  return openConns;
}

// Helper to check if a specific WebSocket belongs to an address
function isConnectionForAddress(address: string, ws: WebSocket): boolean {
  const conns = connections.get(address);
  return conns?.some(c => c.ws === ws) ?? false;
}

// Helper to broadcast to all connections for an address
function broadcastToAddress(address: string, message: any) {
  const conns = connections.get(address);
  if (!conns) return;
  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
  for (const conn of conns) {
    try {
      conn.ws.send(msgStr);
    } catch (e) {
      console.error(`Failed to send to ${address}:`, e);
    }
  }
}
const recentNonces = new Map<string, number>();
// Trial nonces are now persisted in database (trialNoncesTable) for replay protection across restarts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const NONCE_EXPIRY = 15 * 60 * 1000; // 15 minutes - nonce expiry (longer than token TTL for cleanup)
const TIMESTAMP_FRESHNESS = 10 * 60 * 1000; // 10 minutes - token lifetime for signature freshness
const MAX_CLOCK_SKEW = 2 * 60 * 1000; // 2 minutes - bidirectional tolerance for device clock drift
const CALL_TOKEN_TTL = 10 * 60 * 1000; // 10 minutes - server-issued token lifetime
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 60; // Allow more attempts to accommodate retries

function cleanupExpiredNonces() {
  const now = Date.now();
  for (const [nonce, timestamp] of Array.from(recentNonces.entries())) {
    if (now - timestamp > NONCE_EXPIRY) {
      recentNonces.delete(nonce);
    }
  }
}

setInterval(cleanupExpiredNonces, 30000);

// Periodic cleanup of dead WebSocket connections
// This catches connections that died without firing the 'close' event
function cleanupDeadConnections() {
  let totalCleaned = 0;
  for (const [address, conns] of Array.from(connections.entries())) {
    const aliveConns = conns.filter(c => c.ws.readyState === WebSocket.OPEN);
    const deadCount = conns.length - aliveConns.length;
    
    if (deadCount > 0) {
      totalCleaned += deadCount;
      if (aliveConns.length === 0) {
        connections.delete(address);
      } else {
        connections.set(address, aliveConns);
      }
    }
  }
  
  if (totalCleaned > 0) {
    console.log(`[cleanup] Removed ${totalCleaned} dead WebSocket connections`);
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupDeadConnections, 30000);

// Server-side call monitoring: check for stale calls and terminate them
setInterval(async () => {
  try {
    const terminatedIds = await FreeTierShield.terminateStaleCalls();
    if (terminatedIds.length > 0) {
      console.log(`Terminated ${terminatedIds.length} stale calls:`, terminatedIds);
      // Notify connected clients about terminated calls
      for (const callSessionId of terminatedIds) {
        // The FreeTierShield already cleaned up the active call record
        // Clients should handle the heartbeat response to know when to end
      }
    }
  } catch (error) {
    console.error('Error in stale call monitoring:', error);
  }
}, FREE_TIER_LIMITS.HEARTBEAT_INTERVAL_SECONDS * 1000); // Check every heartbeat interval

function checkRateLimit(fromAddress: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(fromAddress);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(fromAddress, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX_CALLS) {
    return false;
  }
  
  record.count++;
  return true;
}

interface VerifyResult {
  valid: boolean;
  reason?: string;
}

function verifySignatureWithDetails(signedIntent: SignedCallIntent): VerifyResult {
  try {
    if (!signedIntent || typeof signedIntent !== 'object') {
      return { valid: false, reason: 'invalid_structure' };
    }
    
    const { intent, signature } = signedIntent;
    
    if (!intent || typeof intent !== 'object') {
      return { valid: false, reason: 'missing_intent' };
    }
    
    if (!signature || typeof signature !== 'string') {
      return { valid: false, reason: 'missing_signature' };
    }
    
    if (!intent.from_pubkey) {
      return { valid: false, reason: 'missing_pubkey' };
    }
    
    if (!intent.timestamp) {
      return { valid: false, reason: 'missing_timestamp' };
    }
    
    if (!intent.nonce) {
      return { valid: false, reason: 'missing_nonce' };
    }
    
    const now = Date.now();
    
    // Clock skew check: intent timestamp must be within ±MAX_CLOCK_SKEW (2 minutes) of server time
    // This prevents timing attacks while allowing for reasonable clock drift
    const timeDiff = Math.abs(now - intent.timestamp);
    if (timeDiff > MAX_CLOCK_SKEW) {
      console.log(`[verify] Clock skew exceeded: timeDiff=${timeDiff}ms, max=${MAX_CLOCK_SKEW}ms, serverNow=${now}, intentTs=${intent.timestamp}`);
      return { valid: false, reason: 'clock_skew_exceeded' };
    }
    
    if (recentNonces.has(intent.nonce)) {
      return { valid: false, reason: 'nonce_replay' };
    }
    
    const sortedIntent = JSON.stringify(intent, Object.keys(intent).sort());
    const message = new TextEncoder().encode(sortedIntent);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(intent.from_pubkey);
    
    const valid = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
    
    if (valid) {
      recentNonces.set(intent.nonce, intent.timestamp);
      return { valid: true };
    }
    
    return { valid: false, reason: 'signature_mismatch' };
  } catch (error) {
    console.error('[verify] Exception during signature verification:', error);
    return { valid: false, reason: 'verification_exception' };
  }
}

// Legacy wrapper for backward compatibility
function verifySignature(signedIntent: SignedCallIntent): boolean {
  return verifySignatureWithDetails(signedIntent).valid;
}

function verifyMessageSignature(signedMessage: SignedMessage): boolean {
  try {
    const { message, signature, from_pubkey } = signedMessage;
    const now = Date.now();
    
    // Clock skew check: message timestamp must be within ±MAX_CLOCK_SKEW (2 minutes) of server time
    const timeDiff = Math.abs(now - message.timestamp);
    if (timeDiff > MAX_CLOCK_SKEW) {
      console.log('[verifyMessage] Clock skew exceeded: timeDiff =', timeDiff, 'ms, max =', MAX_CLOCK_SKEW);
      return false;
    }
    
    if (recentNonces.has(message.nonce)) {
      console.log('Message nonce already used:', message.nonce);
      return false;
    }
    
    const sortedMessage = JSON.stringify(message, Object.keys(message).sort());
    const messageBytes = new TextEncoder().encode(sortedMessage);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(from_pubkey);
    
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    if (valid) {
      recentNonces.set(message.nonce, message.timestamp);
    }
    
    return valid;
  } catch (error) {
    console.error('Message signature verification error:', error);
    return false;
  }
}

function verifyGenericSignature(payload: any, signature: string, from_pubkey: string, nonce: string, timestamp: number): boolean {
  try {
    const now = Date.now();
    
    // Clock skew check: timestamp must be within ±MAX_CLOCK_SKEW (2 minutes) of server time
    const timeDiff = Math.abs(now - timestamp);
    if (timeDiff > MAX_CLOCK_SKEW) {
      console.log('[verifyGeneric] Clock skew exceeded: timeDiff =', timeDiff, 'ms, max =', MAX_CLOCK_SKEW);
      return false;
    }
    
    if (recentNonces.has(nonce)) {
      console.log('Nonce already used:', nonce);
      return false;
    }
    
    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const messageBytes = new TextEncoder().encode(sortedPayload);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(from_pubkey);
    
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    if (valid) {
      recentNonces.set(nonce, timestamp);
    }
    
    return valid;
  } catch (error) {
    console.error('Generic signature verification error:', error);
    return false;
  }
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Helper function to record token metrics
async function recordTokenMetric(eventType: string, userAddress?: string, userAgent?: string, ipAddress?: string, details?: string) {
  try {
    await storage.recordTokenMetric(eventType, userAddress, userAgent, ipAddress, details);
  } catch (error) {
    console.error('Failed to record token metric:', error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  ensureUploadsDir();
  
  // Server time endpoint - provides authoritative server timestamp for client clock sync
  app.get('/api/server-time', (_req, res) => {
    const now = Date.now();
    res.json({
      serverTime: now,
      serverTimeISO: new Date(now).toISOString()
    });
  });
  
  // TURN configuration endpoint with TURN_MODE support
  // TURN_MODE: "public" (default) | "custom" | "off"
  // - "public": Use free OpenRelay TURN servers (TESTING ONLY - not for production)
  // - "custom": Use TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL env vars
  // - "off": STUN only, no TURN
  // STUN_URLS: Optional comma-separated STUN servers (defaults to Google STUN)
  app.get('/api/turn-config', async (_req, res) => {
    const turnMode = (process.env.TURN_MODE || 'public').toLowerCase();
    
    // Base STUN servers - configurable via STUN_URLS env var
    const stunUrls = process.env.STUN_URLS
      ? process.env.STUN_URLS.split(',').map(u => u.trim()).filter(Boolean)
      : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
    const stunServers = stunUrls.map(url => ({ urls: url }));
    
    // TURN_MODE = "off" - STUN only
    if (turnMode === 'off') {
      console.log('TURN_MODE=off: Using STUN only');
      return res.json({ iceServers: stunServers, mode: 'stun_only' });
    }
    
    // TURN_MODE = "custom" - Use custom TURN servers from env vars
    if (turnMode === 'custom') {
      const turnUrls = process.env.TURN_URLS?.split(',').map(u => u.trim()).filter(Boolean);
      const turnUsername = process.env.TURN_USERNAME;
      const turnCredential = process.env.TURN_CREDENTIAL;
      
      if (turnUrls && turnUrls.length > 0 && turnUsername && turnCredential) {
        const customServers = [
          ...stunServers,
          { urls: turnUrls, username: turnUsername, credential: turnCredential }
        ];
        console.log('TURN_MODE=custom: Using custom TURN servers');
        return res.json({ iceServers: customServers, mode: 'custom' });
      } else {
        console.warn('TURN_MODE=custom but missing TURN_URLS, TURN_USERNAME, or TURN_CREDENTIAL - falling back to public');
      }
    }
    
    // Check for Metered.ca config first (takes priority over OpenRelay)
    let meteredAppName = process.env.METERED_APP_NAME;
    const meteredSecretKey = process.env.METERED_SECRET_KEY;
    
    if (meteredAppName && meteredSecretKey) {
      meteredAppName = meteredAppName.replace(/\.metered\.live$/i, '');
      
      try {
        const url = `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredSecretKey}`;
        console.log(`Fetching Metered TURN credentials from: ${meteredAppName}.metered.live`);
        const response = await fetch(url);
        if (response.ok) {
          const iceServers = await response.json();
          console.log('Metered TURN credentials fetched successfully:', iceServers.length, 'servers');
          return res.json({ iceServers, mode: 'metered' });
        } else {
          const errorText = await response.text();
          console.error('Metered API error:', response.status, errorText);
        }
      } catch (error) {
        console.error('Failed to fetch Metered TURN credentials:', error);
      }
    }
    
    // TURN_MODE = "public" (default) - Use free OpenRelay TURN servers
    // ⚠️ OpenRelay public TURN is TESTING ONLY — not for production customers
    const openRelayServers = [
      ...stunServers,
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];
    
    console.log('TURN_MODE=public: Using OpenRelay free TURN (TESTING ONLY)');
    return res.json({ iceServers: openRelayServers, mode: 'public_openrelay' });
  });

  // Cleanup expired call tokens from database every hour
  setInterval(async () => {
    try {
      const count = await storage.cleanupExpiredCallTokens();
      if (count > 0) {
        console.log(`Cleaned up ${count} expired call tokens`);
      }
    } catch (error) {
      console.error('Error cleaning up call tokens:', error);
    }
  }, 60 * 60 * 1000);

  // Call session token endpoint - mints a server-issued token with plan-based permissions
  // Uses server time as source of truth, stored in database for replay protection
  app.post('/api/call-session-token', async (req, res) => {
    try {
      const { address, targetAddress } = req.body;
      const userAgent = req.headers['user-agent'] || 'unknown';
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      if (!address) {
        await recordTokenMetric('verify_invalid', undefined, userAgent, clientIp, 'Missing address');
        return res.status(400).json({ error: 'Address required' });
      }

      // Get user's plan and entitlements
      const user = await storage.getIdentity(address);
      let plan = 'free';
      let allowTurn = false;
      let allowVideo = true;

      if (user) {
        // Check subscription status (planStatus is used for Stripe subscription state)
        if (user.planStatus === 'active' || user.planStatus === 'trialing') {
          plan = user.plan || 'pro';
          allowTurn = true;
        }
        // Check trial access
        else if (user.trialStatus === 'active' && user.trialEndAt && new Date(user.trialEndAt) > new Date()) {
          plan = user.trialPlan || 'pro';
          allowTurn = true;
        }
        // Check if comped
        else if (user.isComped) {
          plan = user.plan || 'pro';
          allowTurn = true;
        }
        // Check admin/founder status
        else if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'ultra_god_admin' || user.role === 'founder') {
          plan = 'business';
          allowTurn = true;
        }
      }

      // Check TURN_MODE and if TURN is configured on server
      // TURN_MODE: "public" (default) | "custom" | "off"
      // - "public": Use free OpenRelay TURN servers for ALL users (TESTING ONLY)
      // - "custom": Use TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL (plan-gated)
      // - "off": STUN only, no TURN for anyone
      const turnMode = (process.env.TURN_MODE || 'public').toLowerCase();
      const meteredConfigured = !!(process.env.METERED_APP_NAME && process.env.METERED_SECRET_KEY);
      const customTurnConfigured = !!(process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL);
      const legacyTurnConfigured = !!(process.env.TURN_URL && process.env.TURN_USER && process.env.TURN_PASS);
      
      // Determine actual TURN availability based on TURN_MODE
      // - "off": TURN is never available (turnConfigured = false)
      // - "public": TURN is always available (free OpenRelay)
      // - "custom": TURN is available only if custom env vars are set (not legacy fallback)
      // - Metered always takes priority if configured
      let turnConfigured: boolean;
      let finalAllowTurn: boolean;
      
      if (turnMode === 'off') {
        turnConfigured = false;
        finalAllowTurn = false;
      } else if (turnMode === 'public') {
        turnConfigured = true;
        finalAllowTurn = true; // Everyone gets TURN in public mode
      } else if (turnMode === 'custom') {
        // Custom mode: only configured if custom env vars are present (not legacy)
        // Metered takes priority over custom
        turnConfigured = meteredConfigured || customTurnConfigured;
        finalAllowTurn = allowTurn && turnConfigured;
      } else {
        // Default: metered, custom, or legacy (for backwards compatibility)
        turnConfigured = meteredConfigured || customTurnConfigured || legacyTurnConfigured;
        finalAllowTurn = allowTurn && turnConfigured;
      }

      // Create database-backed token with server timestamps
      const tokenData = await storage.createCallToken(
        address,
        targetAddress,
        plan,
        finalAllowTurn,
        allowVideo
      );

      // Record metric
      await recordTokenMetric('minted', address, userAgent, clientIp);

      // Build ICE servers config
      let iceServers: any[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];

      // Add TURN servers based on TURN_MODE and user entitlements
      if (finalAllowTurn) {
        if (turnMode === 'public') {
          // ⚠️ OpenRelay free TURN servers - TESTING ONLY, not for production
          iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.relay.metered.ca:80' },
            { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
          ];
          console.log('[TURN] Using public OpenRelay servers (TESTING MODE)');
        } else if (meteredConfigured) {
          // Fetch from Metered.ca API
          try {
            // Strip ".metered.live" suffix if user included it
            const appName = (process.env.METERED_APP_NAME || '').replace(/\.metered\.live$/i, '');
            const meteredResponse = await fetch(
              `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${process.env.METERED_SECRET_KEY}`
            );
            if (meteredResponse.ok) {
              const meteredServers = await meteredResponse.json();
              iceServers = meteredServers; // Metered provides complete ICE server list
              console.log('[TURN] Using Metered.ca TURN servers');
            } else {
              // Fallback to OpenRelay free TURN servers
              iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.relay.metered.ca:80' },
                { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
              ];
              console.log('[TURN] Metered API failed, falling back to OpenRelay');
            }
          } catch (error) {
            console.error('Failed to fetch Metered TURN credentials:', error);
            // Fallback to OpenRelay free TURN servers
            iceServers = [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun.relay.metered.ca:80' },
              { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
              { urls: 'turn:openrelay.metered.ca:443?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
              { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
            ];
          }
        } else if (customTurnConfigured) {
          // Use custom TURN config from env vars
          const turnUrls = process.env.TURN_URLS!.split(',').map(u => u.trim());
          iceServers.push({
            urls: turnUrls,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL
          });
          console.log('[TURN] Using custom TURN servers');
        } else if (legacyTurnConfigured && turnMode !== 'custom') {
          // Use legacy TURN config (only if not in custom mode - no fallback to legacy in custom mode)
          iceServers.push({
            urls: [process.env.TURN_URL!],
            username: process.env.TURN_USER,
            credential: process.env.TURN_PASS
          });
          console.log('[TURN] Using legacy TURN config');
        }
      }

      // Return with server timestamps
      res.json({
        token: tokenData.token,
        nonce: tokenData.nonce,
        issuedAt: tokenData.issuedAt.getTime(),
        expiresAt: tokenData.expiresAt.getTime(),
        serverTime: Date.now(),
        plan,
        allowTurn: finalAllowTurn,
        allowVideo,
        turnConfigured,
        iceServers
      });
    } catch (error) {
      console.error('Call session token error:', error);
      res.status(500).json({ error: 'Failed to generate call session token' });
    }
  });

  // Validate call session token (with optional consumption for one-time use)
  app.post('/api/call-session-token/verify', async (req, res) => {
    try {
      const { token, markUsed = false } = req.body;
      const userAgent = req.headers['user-agent'] || 'unknown';
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      if (!token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const result = await storage.verifyCallToken(token, markUsed, clientIp);

      if (!result.valid) {
        // Record failure metric with reason
        const eventType = result.reason === 'token_expired' ? 'verify_expired' 
          : result.reason === 'token_replay' ? 'verify_replay' 
          : 'verify_invalid';
        await recordTokenMetric(eventType, result.data?.userAddress, userAgent, clientIp, result.reason);

        // Return technical error (user never sees this - client handles retry)
        const errorMessage = result.reason === 'token_expired' 
          ? 'Session token expired'
          : result.reason === 'token_replay'
          ? 'This session has already been used'
          : 'Invalid session token';

        return res.status(401).json({ 
          error: errorMessage,
          reason: result.reason,
          retryable: result.reason === 'token_expired' // Client can request a new token
        });
      }

      await recordTokenMetric('verify_ok', result.data?.userAddress, userAgent, clientIp);

      res.json({
        valid: true,
        plan: result.data?.plan,
        allowTurn: result.data?.allowTurn,
        allowVideo: result.data?.allowVideo
      });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({ error: 'Failed to verify token' });
    }
  });

  // Legacy GET endpoint for backwards compatibility (read-only check)
  app.get('/api/call-session-token/:token', async (req, res) => {
    const { token } = req.params;
    const result = await storage.verifyCallToken(token, false); // Don't mark as used
    
    if (!result.valid) {
      return res.status(401).json({ 
        error: result.reason === 'token_expired' ? 'Token expired' : 'Token not found or invalid',
        reason: result.reason
      });
    }
    
    res.json({
      valid: true,
      plan: result.data?.plan,
      allowTurn: result.data?.allowTurn,
      allowVideo: result.data?.allowVideo
    });
  });

  app.post('/api/upload', (req, res) => {
    const chunks: Buffer[] = [];
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const fileName = req.headers['x-filename'] as string || `file_${Date.now()}`;
    
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks);
        const maxSize = 10 * 1024 * 1024;
        if (data.length > maxSize) {
          res.status(413).json({ error: 'File too large (max 10MB)' });
          return;
        }
        
        const ext = path.extname(fileName) || '.bin';
        const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
        const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`;
        const filePath = path.join(UPLOADS_DIR, fileId);
        
        fs.writeFileSync(filePath, data);
        
        res.json({
          url: `/api/files/${fileId}`,
          name: fileName,
          size: data.length
        });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
      }
    });
  });

  app.get('/api/files/:fileId', (req, res) => {
    const { fileId } = req.params;
    const safeName = fileId.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = path.join(UPLOADS_DIR, safeName);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    res.sendFile(filePath);
  });

  app.get('/api/conversations/:address', (req, res) => {
    const { address } = req.params;
    const convos = messageStore.getConversationsForAddress(address);
    res.json(convos);
  });

  app.get('/api/messages/:convoId', async (req, res) => {
    const { convoId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? parseInt(req.query.before as string) : undefined;
    
    // First try in-memory store
    let messages = messageStore.getMessages(convoId, limit, before);
    
    // If no messages in memory, fallback to database
    if (messages.length === 0) {
      try {
        const dbMessages = await storage.getMessagesSinceSeq(convoId, 0, limit);
        // Convert DB format to API format
        messages = dbMessages.map((m: any) => ({
          id: m.id,
          convo_id: m.convoId,
          from_address: m.fromAddress,
          to_address: m.toAddress,
          content: m.content,
          type: m.messageType || 'text',
          timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
          server_timestamp: m.serverTimestamp ? new Date(m.serverTimestamp).getTime() : Date.now(),
          seq: m.seq,
          status: m.status || 'sent',
          nonce: m.nonce,
          attachment_url: m.mediaUrl,
          attachment_name: m.attachmentName,
          attachment_size: m.attachmentSize
        }));
      } catch (error) {
        console.error('Error fetching messages from DB:', error);
      }
    }
    
    res.json(messages);
  });

  app.get('/api/messages/:convoId/search', (req, res) => {
    const { convoId } = req.params;
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = messageStore.searchMessages(query, convoId, limit);
    res.json(messages);
  });

  app.get('/api/messages/search/global', (req, res) => {
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = messageStore.searchMessages(query, undefined, limit);
    res.json(messages);
  });

  app.get('/api/messages/:convoId/since/:timestamp', (req, res) => {
    const { convoId, timestamp } = req.params;
    const messages = messageStore.getMessagesSince(convoId, parseInt(timestamp));
    res.json(messages);
  });

  // Sync endpoints for cross-device support (WhatsApp-like) - uses DB layer
  app.get('/api/messages/:convoId/sync', async (req, res) => {
    try {
      const { convoId } = req.params;
      const sinceSeq = parseInt(req.query.since_seq as string) || 0;
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = await storage.getMessagesSinceSeq(convoId, sinceSeq, limit);
      const latestSeq = await storage.getLatestSeq(convoId);
      res.json({ messages, latest_seq: latestSeq, has_more: messages.length >= limit });
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({ error: 'Failed to sync messages' });
    }
  });

  app.get('/api/conversations/sync', async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: 'Address required' });
      }
      const conversations = await storage.getConversationsWithSeq(address);
      res.json(conversations);
    } catch (error) {
      console.error('Conversations sync error:', error);
      res.status(500).json({ error: 'Failed to sync conversations' });
    }
  });

  // Phase 5: Creator Profile API
  app.get('/api/creator/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const profile = await storage.getCreatorProfile(address);
      res.json(profile || null);
    } catch (error) {
      console.error('Error getting creator profile:', error);
      res.status(500).json({ error: 'Failed to get creator profile' });
    }
  });

  app.get('/api/creator/handle/:handle', async (req, res) => {
    try {
      const { handle } = req.params;
      const profile = await storage.getCreatorProfileByHandle(handle);
      res.json(profile || null);
    } catch (error) {
      console.error('Error getting creator profile by handle:', error);
      res.status(500).json({ error: 'Failed to get creator profile' });
    }
  });

  app.post('/api/creator', async (req, res) => {
    try {
      const profileData = req.body;
      
      // Check if trying to set branding fields - requires Business plan (check presence, not truthiness)
      const brandingFields = ['brandingColor', 'brandingAccentColor', 'logoUrl', 'bannerUrl', 'customTheme', 'customCss'];
      const hasBrandingData = brandingFields.some(field => field in profileData);
      
      // Check if trying to set availability controls - requires Pro plan (check presence, not truthiness)
      const availabilityFields = ['businessHours', 'afterHoursBehavior', 'afterHoursMessage'];
      const hasAvailabilityData = availabilityFields.some(field => field in profileData);
      
      if (profileData.ownerAddress) {
        const entitlements = await getEffectiveEntitlements(profileData.ownerAddress);
        
        if (hasBrandingData && !entitlements.allowCustomBranding) {
          return res.status(403).json({ 
            error: 'Custom branding requires a Business plan',
            upgradeRequired: true
          });
        }
        
        if (hasAvailabilityData && !entitlements.allowAvailabilityControls) {
          return res.status(403).json({ 
            error: 'Availability controls require a Pro or Business plan',
            upgradeRequired: true
          });
        }
      }
      
      const profile = await storage.createCreatorProfile(profileData);
      res.json(profile);
    } catch (error) {
      console.error('Error creating creator profile:', error);
      res.status(500).json({ error: 'Failed to create creator profile' });
    }
  });

  app.put('/api/creator/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const updates = req.body;
      
      // Check if trying to update branding fields - requires Business plan
      const brandingFields = ['brandingColor', 'brandingAccentColor', 'logoUrl', 'bannerUrl', 'customTheme', 'customCss'];
      const hasBrandingUpdates = brandingFields.some(field => field in updates);
      
      // Check if trying to update availability controls - requires Pro plan
      const availabilityFields = ['businessHours', 'afterHoursBehavior', 'afterHoursMessage'];
      const hasAvailabilityUpdates = availabilityFields.some(field => field in updates);
      
      const entitlements = await getEffectiveEntitlements(address);
      
      if (hasBrandingUpdates && !entitlements.allowCustomBranding) {
        return res.status(403).json({ 
          error: 'Custom branding requires a Business plan',
          upgradeRequired: true
        });
      }
      
      if (hasAvailabilityUpdates && !entitlements.allowAvailabilityControls) {
        return res.status(403).json({ 
          error: 'Availability controls require a Pro or Business plan',
          upgradeRequired: true
        });
      }
      
      const profile = await storage.updateCreatorProfile(address, updates);
      res.json(profile);
    } catch (error) {
      console.error('Error updating creator profile:', error);
      res.status(500).json({ error: 'Failed to update creator profile' });
    }
  });

  // ========== SCHEDULED CALLS API (Pro/Business feature) ==========
  app.get('/api/scheduled-calls/:creatorAddress', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const calls = await storage.getScheduledCallsForCreator(creatorAddress);
      res.json(calls);
    } catch (error) {
      console.error('Error getting scheduled calls:', error);
      res.status(500).json({ error: 'Failed to get scheduled calls' });
    }
  });

  app.get('/api/scheduled-calls/:creatorAddress/upcoming', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const calls = await storage.getUpcomingScheduledCalls(creatorAddress, limit);
      res.json(calls);
    } catch (error) {
      console.error('Error getting upcoming scheduled calls:', error);
      res.status(500).json({ error: 'Failed to get upcoming calls' });
    }
  });

  app.get('/api/my-scheduled-calls/:callerAddress', async (req, res) => {
    try {
      const { callerAddress } = req.params;
      const calls = await storage.getScheduledCallsForCaller(callerAddress);
      res.json(calls);
    } catch (error) {
      console.error('Error getting caller scheduled calls:', error);
      res.status(500).json({ error: 'Failed to get scheduled calls' });
    }
  });

  app.post('/api/scheduled-calls', async (req, res) => {
    try {
      const { creatorAddress, callerAddress, scheduledAt, durationMinutes, callType, notes, callerName, callerEmail } = req.body;
      
      if (!creatorAddress || !callerAddress || !scheduledAt) {
        return res.status(400).json({ error: 'Creator address, caller address, and scheduled time are required' });
      }

      // Check if creator has scheduling entitlement
      const entitlements = await getEffectiveEntitlements(creatorAddress);
      if (!entitlements.allowCallScheduling) {
        return res.status(403).json({ 
          error: 'Call scheduling requires a Pro or Business plan',
          upgradeRequired: true
        });
      }

      // Validate scheduled time is in the future
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }

      const call = await storage.createScheduledCall({
        creatorAddress,
        callerAddress,
        callerName: callerName || null,
        callerEmail: callerEmail || null,
        scheduledAt: scheduledDate,
        durationMinutes: durationMinutes || 30,
        callType: callType || 'video',
        status: 'pending',
        notes: notes || null,
        isPaid: false,
        paidTokenId: null,
        reminderSent: false,
        cancelledBy: null,
        cancelReason: null,
      });
      
      res.json(call);
    } catch (error) {
      console.error('Error creating scheduled call:', error);
      res.status(500).json({ error: 'Failed to create scheduled call' });
    }
  });

  app.put('/api/scheduled-calls/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the existing call to check entitlements using authoritative record
      const existingCall = await storage.getScheduledCall(id);
      if (!existingCall) {
        return res.status(404).json({ error: 'Scheduled call not found' });
      }
      
      // Check if creator has scheduling entitlement (authoritative check)
      const entitlements = await getEffectiveEntitlements(existingCall.creatorAddress);
      if (!entitlements.allowCallScheduling) {
        return res.status(403).json({ 
          error: 'Call scheduling requires a Pro or Business plan',
          upgradeRequired: true
        });
      }
      
      const call = await storage.updateScheduledCall(id, req.body);
      res.json(call);
    } catch (error) {
      console.error('Error updating scheduled call:', error);
      res.status(500).json({ error: 'Failed to update scheduled call' });
    }
  });

  app.post('/api/scheduled-calls/:id/confirm', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the existing call (authoritative record)
      const existingCall = await storage.getScheduledCall(id);
      if (!existingCall) {
        return res.status(404).json({ error: 'Scheduled call not found' });
      }
      
      // Check if creator has scheduling entitlement (authoritative check)
      const entitlements = await getEffectiveEntitlements(existingCall.creatorAddress);
      if (!entitlements.allowCallScheduling) {
        return res.status(403).json({ 
          error: 'Call scheduling requires a Pro or Business plan',
          upgradeRequired: true
        });
      }
      
      const call = await storage.updateScheduledCall(id, { status: 'confirmed' });
      res.json(call);
    } catch (error) {
      console.error('Error confirming scheduled call:', error);
      res.status(500).json({ error: 'Failed to confirm scheduled call' });
    }
  });

  app.post('/api/scheduled-calls/:id/cancel', async (req, res) => {
    try {
      const { id } = req.params;
      const { cancelledBy, reason } = req.body;
      
      if (!cancelledBy) {
        return res.status(400).json({ error: 'Cancelled by address is required' });
      }
      
      // Get the existing call (authoritative record)
      const existingCall = await storage.getScheduledCall(id);
      if (!existingCall) {
        return res.status(404).json({ error: 'Scheduled call not found' });
      }
      
      // Check if creator has scheduling entitlement (authoritative check)
      // Callers can always cancel their own scheduled calls regardless of creator plan
      const creatorEntitlements = await getEffectiveEntitlements(existingCall.creatorAddress);
      if (!creatorEntitlements.allowCallScheduling && cancelledBy !== existingCall.callerAddress) {
        return res.status(403).json({ 
          error: 'Call scheduling requires a Pro or Business plan',
          upgradeRequired: true
        });
      }
      
      const call = await storage.cancelScheduledCall(id, cancelledBy, reason);
      res.json(call);
    } catch (error) {
      console.error('Error cancelling scheduled call:', error);
      res.status(500).json({ error: 'Failed to cancel scheduled call' });
    }
  });

  app.delete('/api/scheduled-calls/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteScheduledCall(id);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Error deleting scheduled call:', error);
      res.status(500).json({ error: 'Failed to delete scheduled call' });
    }
  });

  // ========== TEAMS API (Business feature) ==========
  app.get('/api/teams/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params;
      const teamsList = await storage.getTeamsForOwner(ownerAddress);
      res.json(teamsList);
    } catch (error) {
      console.error('Error getting teams:', error);
      res.status(500).json({ error: 'Failed to get teams' });
    }
  });

  app.get('/api/team/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      res.json(team);
    } catch (error) {
      console.error('Error getting team:', error);
      res.status(500).json({ error: 'Failed to get team' });
    }
  });

  app.post('/api/teams', async (req, res) => {
    try {
      const { ownerAddress, name, description } = req.body;
      
      if (!ownerAddress || !name) {
        return res.status(400).json({ error: 'Owner address and team name are required' });
      }

      // Check if owner has team management entitlement
      const entitlements = await getEffectiveEntitlements(ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }

      const team = await storage.createTeam({
        ownerAddress,
        name,
        description: description || null,
      });
      
      // Auto-add owner as team member with all permissions
      await storage.addTeamMember({
        teamId: team.id,
        memberAddress: ownerAddress,
        role: 'owner',
        permissions: ['answer_calls', 'view_queue', 'manage_schedule', 'view_earnings', 'manage_team'],
        addedBy: ownerAddress,
      });
      
      res.json(team);
    } catch (error) {
      console.error('Error creating team:', error);
      res.status(500).json({ error: 'Failed to create team' });
    }
  });

  app.put('/api/team/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the team to check owner entitlements
      const existingTeam = await storage.getTeam(id);
      if (!existingTeam) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      const entitlements = await getEffectiveEntitlements(existingTeam.ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }
      
      const team = await storage.updateTeam(id, req.body);
      res.json(team);
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({ error: 'Failed to update team' });
    }
  });

  app.delete('/api/team/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the team to check owner entitlements
      const existingTeam = await storage.getTeam(id);
      if (!existingTeam) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      const entitlements = await getEffectiveEntitlements(existingTeam.ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }
      
      const deleted = await storage.deleteTeam(id);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Error deleting team:', error);
      res.status(500).json({ error: 'Failed to delete team' });
    }
  });

  // Team Members
  app.get('/api/team/:teamId/members', async (req, res) => {
    try {
      const { teamId } = req.params;
      const members = await storage.getTeamMembers(teamId);
      res.json(members);
    } catch (error) {
      console.error('Error getting team members:', error);
      res.status(500).json({ error: 'Failed to get team members' });
    }
  });

  app.post('/api/team/:teamId/members', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { memberAddress, role, permissions, addedBy } = req.body;
      
      if (!memberAddress) {
        return res.status(400).json({ error: 'Member address is required' });
      }

      // Get the team to check owner entitlements
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      const entitlements = await getEffectiveEntitlements(team.ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }

      // Check if member already exists
      const existing = await storage.getTeamMember(teamId, memberAddress);
      if (existing) {
        return res.status(409).json({ error: 'Member already in team' });
      }

      const member = await storage.addTeamMember({
        teamId,
        memberAddress,
        role: role || 'member',
        permissions: permissions || ['view_queue'],
        addedBy: addedBy || null,
      });
      
      res.json(member);
    } catch (error) {
      console.error('Error adding team member:', error);
      res.status(500).json({ error: 'Failed to add team member' });
    }
  });

  app.put('/api/team-member/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the existing member to find their team (authoritative lookup)
      const members = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
      if (members.length === 0) {
        return res.status(404).json({ error: 'Team member not found' });
      }
      const existingMember = members[0];
      
      // Get the team to check owner entitlements (authoritative check)
      const team = await storage.getTeam(existingMember.teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      const entitlements = await getEffectiveEntitlements(team.ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }
      
      const member = await storage.updateTeamMember(id, req.body);
      if (!member) {
        return res.status(404).json({ error: 'Team member not found' });
      }
      res.json(member);
    } catch (error) {
      console.error('Error updating team member:', error);
      res.status(500).json({ error: 'Failed to update team member' });
    }
  });

  app.delete('/api/team/:teamId/members/:memberAddress', async (req, res) => {
    try {
      const { teamId, memberAddress } = req.params;
      
      // Get the team to check owner entitlements
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      
      const entitlements = await getEffectiveEntitlements(team.ownerAddress);
      if (!entitlements.allowTeamManagement) {
        return res.status(403).json({ 
          error: 'Team management requires a Business plan',
          upgradeRequired: true
        });
      }
      
      const deleted = await storage.removeTeamMember(teamId, memberAddress);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Error removing team member:', error);
      res.status(500).json({ error: 'Failed to remove team member' });
    }
  });

  app.get('/api/my-teams/:memberAddress', async (req, res) => {
    try {
      const { memberAddress } = req.params;
      const teamsList = await storage.getTeamsForMember(memberAddress);
      res.json(teamsList);
    } catch (error) {
      console.error('Error getting member teams:', error);
      res.status(500).json({ error: 'Failed to get member teams' });
    }
  });

  // Phase 5: Contacts API
  app.get('/api/contacts/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params;
      const contactsList = await storage.getContacts(ownerAddress);
      res.json(contactsList);
    } catch (error) {
      console.error('Error getting contacts:', error);
      res.status(500).json({ error: 'Failed to get contacts' });
    }
  });

  app.post('/api/contacts', async (req, res) => {
    try {
      const contact = await storage.createContact(req.body);
      
      // Notify the contact person that they've been added (if online)
      const contactAddress = req.body.contactAddress;
      const ownerAddress = req.body.ownerAddress;
      const savedAsName = req.body.name || 'a contact';
      
      if (contactAddress) {
        // Get the adder's identity to show their name
        const adderIdentity = await storage.getIdentity(ownerAddress);
        // Also check if the recipient has the adder saved as a contact
        const existingContact = await storage.getContact(contactAddress, ownerAddress);
        const adderName = existingContact?.name || adderIdentity?.displayName || ownerAddress.slice(5, 17) + '...';
        
        broadcastToAddress(contactAddress, {
            type: 'contact:added_by',
            data: {
              addedBy: ownerAddress,
              adderName: adderName,
              savedAsName: savedAsName,
              timestamp: Date.now()
            }
          });
          
        // Also send push notification if they're offline
        await sendPushNotification(contactAddress, {
          type: 'contact_added',
          title: 'New Contact',
          body: `${adderName} saved you as "${savedAsName}"`,
          tag: 'contact-added',
          from_address: ownerAddress
        });
        
        console.log(`[contact:added_by] Notified ${contactAddress} that ${adderName} saved them as "${savedAsName}"`);
      }
      
      res.json(contact);
    } catch (error) {
      console.error('Error creating contact:', error);
      res.status(500).json({ error: 'Failed to create contact' });
    }
  });

  app.put('/api/contacts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const contact = await storage.updateContact(id, req.body);
      res.json(contact);
    } catch (error) {
      console.error('Error updating contact:', error);
      res.status(500).json({ error: 'Failed to update contact' });
    }
  });

  app.delete('/api/contacts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteContact(id);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Error deleting contact:', error);
      res.status(500).json({ error: 'Failed to delete contact' });
    }
  });

  // Online Status API - check if contacts are online
  app.post('/api/online-status', async (req, res) => {
    try {
      const { addresses } = req.body;
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ error: 'Addresses must be an array' });
      }
      
      const onlineStatus: Record<string, boolean> = {};
      for (const address of addresses) {
        // Check if there's an active WebSocket connection for this address
        const conn = getConnection(address);
        onlineStatus[address] = !!conn;
      }
      
      res.json(onlineStatus);
    } catch (error) {
      console.error('Error checking online status:', error);
      res.status(500).json({ error: 'Failed to check online status' });
    }
  });

  // Phase 5: Call History API
  app.get('/api/calls/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getCallHistory(address, limit);
      res.json(history);
    } catch (error) {
      console.error('Error getting call history:', error);
      res.status(500).json({ error: 'Failed to get call history' });
    }
  });

  app.post('/api/calls', async (req, res) => {
    try {
      const session = await storage.createCallSession(req.body);
      res.json(session);
    } catch (error) {
      console.error('Error creating call session:', error);
      res.status(500).json({ error: 'Failed to create call session' });
    }
  });

  app.put('/api/calls/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.updateCallSession(id, req.body);
      res.json(session);
    } catch (error) {
      console.error('Error updating call session:', error);
      res.status(500).json({ error: 'Failed to update call session' });
    }
  });

  // Phase 5: Paid Call Tokens API
  app.get('/api/paid-tokens/:creatorAddress', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const tokens = await storage.getCreatorPaidTokens(creatorAddress);
      res.json(tokens);
    } catch (error) {
      console.error('Error getting paid tokens:', error);
      res.status(500).json({ error: 'Failed to get paid tokens' });
    }
  });

  app.get('/api/paid-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenRecord = await storage.getPaidCallToken(token);
      res.json(tokenRecord || null);
    } catch (error) {
      console.error('Error getting paid token:', error);
      res.status(500).json({ error: 'Failed to get paid token' });
    }
  });

  app.post('/api/paid-tokens', async (req, res) => {
    try {
      const tokenRecord = await storage.createPaidCallToken(req.body);
      res.json(tokenRecord);
    } catch (error) {
      console.error('Error creating paid token:', error);
      res.status(500).json({ error: 'Failed to create paid token' });
    }
  });

  app.put('/api/paid-tokens/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const tokenRecord = await storage.updatePaidCallToken(id, req.body);
      res.json(tokenRecord);
    } catch (error) {
      console.error('Error updating paid token:', error);
      res.status(500).json({ error: 'Failed to update paid token' });
    }
  });

  // Phase 5: Call Queue API
  app.get('/api/queue/:creatorAddress', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const queue = await storage.getCallQueue(creatorAddress);
      res.json(queue);
    } catch (error) {
      console.error('Error getting call queue:', error);
      res.status(500).json({ error: 'Failed to get call queue' });
    }
  });

  app.post('/api/queue', async (req, res) => {
    try {
      // Get the caller's priority based on their plan
      const callerAddress = req.body.callerAddress;
      let callPriority = 0; // default for free users
      
      if (callerAddress) {
        const entitlements = await getEffectiveEntitlements(callerAddress);
        if (entitlements.allowPriorityRouting) {
          // Get identity to check callPriority field
          const identity = await storage.getIdentity(callerAddress);
          callPriority = identity?.callPriority ?? (entitlements.plan === 'business' ? 100 : 50);
        }
      }
      
      const entry = await storage.addToCallQueue({
        ...req.body,
        callPriority
      });
      res.json(entry);
    } catch (error) {
      console.error('Error adding to queue:', error);
      res.status(500).json({ error: 'Failed to add to queue' });
    }
  });

  app.put('/api/queue/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const entry = await storage.updateQueueEntry(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error('Error updating queue entry:', error);
      res.status(500).json({ error: 'Failed to update queue entry' });
    }
  });

  app.delete('/api/queue/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const removed = await storage.removeFromQueue(id);
      res.json({ success: removed });
    } catch (error) {
      console.error('Error removing from queue:', error);
      res.status(500).json({ error: 'Failed to remove from queue' });
    }
  });

  // Phase 5: Creator Earnings API
  app.get('/api/earnings/:creatorAddress', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const period = req.query.period as string;
      const earnings = await storage.getCreatorEarnings(creatorAddress, period);
      res.json(earnings);
    } catch (error) {
      console.error('Error getting earnings:', error);
      res.status(500).json({ error: 'Failed to get earnings' });
    }
  });

  app.get('/api/earnings/:creatorAddress/stats', async (req, res) => {
    try {
      const { creatorAddress } = req.params;
      const stats = await storage.getCreatorStats(creatorAddress);
      res.json(stats);
    } catch (error) {
      console.error('Error getting creator stats:', error);
      res.status(500).json({ error: 'Failed to get creator stats' });
    }
  });

  // Phase 5: Stripe Checkout for Paid Calls
  app.post('/api/checkout/paid-call', async (req, res) => {
    try {
      const { creatorAddress, callerAddress, amountCents, callType, pricingType } = req.body;
      
      const stripe = await getUncachableStripeClient();
      const token = `pct_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${callType === 'video' ? 'Video' : 'Voice'} Call`,
              description: `Paid call with creator`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/call?token=${token}&success=true`,
        cancel_url: `${req.protocol}://${req.get('host')}/call?cancelled=true`,
        metadata: {
          token,
          creatorAddress,
          callerAddress,
          callType,
          pricingType,
        },
      });

      // Create paid call token in database
      const tokenRecord = await storage.createPaidCallToken({
        creatorAddress,
        callerAddress,
        token,
        checkoutSessionId: session.id,
        status: 'pending',
        amountCents,
        currency: 'usd',
        pricingType,
        callType,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      res.json({ url: session.url, token: tokenRecord.token });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/checkout/verify-token', async (req, res) => {
    try {
      const { token } = req.body;
      const tokenRecord = await storage.getPaidCallToken(token);
      
      if (!tokenRecord) {
        return res.status(404).json({ error: 'Token not found' });
      }
      
      if (tokenRecord.status === 'used') {
        return res.status(400).json({ error: 'Token already used' });
      }
      
      if (tokenRecord.status === 'expired' || (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date())) {
        return res.status(400).json({ error: 'Token expired' });
      }
      
      // Check payment status with Stripe
      if (tokenRecord.checkoutSessionId) {
        const stripe = await getUncachableStripeClient();
        const session = await stripe.checkout.sessions.retrieve(tokenRecord.checkoutSessionId);
        
        if (session.payment_status === 'paid') {
          await storage.updatePaidCallToken(tokenRecord.id, { 
            status: 'paid',
            paymentIntentId: session.payment_intent as string
          });
          return res.json({ valid: true, status: 'paid', tokenRecord: { ...tokenRecord, status: 'paid' } });
        }
      }
      
      res.json({ valid: tokenRecord.status === 'paid', status: tokenRecord.status, tokenRecord });
    } catch (error) {
      console.error('Error verifying token:', error);
      res.status(500).json({ error: 'Failed to verify token' });
    }
  });

  app.post('/api/checkout/use-token', async (req, res) => {
    try {
      const { token } = req.body;
      const tokenRecord = await storage.getPaidCallToken(token);
      
      if (!tokenRecord || tokenRecord.status !== 'paid') {
        return res.status(400).json({ error: 'Invalid or unpaid token' });
      }
      
      await storage.updatePaidCallToken(tokenRecord.id, { 
        status: 'used',
        usedAt: new Date()
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error using token:', error);
      res.status(500).json({ error: 'Failed to use token' });
    }
  });

  // Phase 7: Crypto Payments (Base network + Solana)
  const cryptoPayments = await import('./cryptoPayments');
  const solanaPayments = await import('./solanaPayments');
  
  app.get('/api/crypto/enabled', async (_req, res) => {
    res.json({ 
      base: {
        enabled: cryptoPayments.isCryptoPaymentsEnabled(),
        assets: ['USDC', 'ETH']
      },
      solana: {
        enabled: solanaPayments.isSolanaPaymentsEnabled(),
        cluster: solanaPayments.getSolanaCluster(),
        assets: ['USDC', 'SOL']
      }
    });
  });

  app.get('/api/crypto/eth-price', async (_req, res) => {
    if (!cryptoPayments.isCryptoPaymentsEnabled()) {
      return res.status(400).json({ error: 'Crypto payments disabled' });
    }
    const price = await cryptoPayments.getEthUsdPrice();
    res.json({ price, available: price !== null });
  });

  app.get('/api/crypto/sol-price', async (_req, res) => {
    if (!solanaPayments.isSolanaPaymentsEnabled()) {
      return res.status(400).json({ error: 'Solana payments disabled' });
    }
    const price = await solanaPayments.getSolUsdPrice();
    res.json({ price, available: price !== null });
  });

  app.post('/api/crypto-invoice/create', async (req, res) => {
    try {
      const { payTokenId, asset, chain = 'base', payerCallId } = req.body;

      if (!payTokenId || !asset || !chain) {
        return res.status(400).json({ error: 'Missing required fields: payTokenId, asset, chain' });
      }

      if (chain !== 'base' && chain !== 'solana') {
        return res.status(400).json({ error: 'Invalid chain. Use base or solana' });
      }

      if (chain === 'base' && !cryptoPayments.isCryptoPaymentsEnabled()) {
        return res.status(400).json({ error: 'Base crypto payments are disabled' });
      }

      if (chain === 'solana' && !solanaPayments.isSolanaPaymentsEnabled()) {
        return res.status(400).json({ error: 'Solana payments are disabled' });
      }

      if (chain === 'base' && asset !== 'USDC' && asset !== 'ETH') {
        return res.status(400).json({ error: 'Invalid asset for Base. Use USDC or ETH' });
      }

      if (chain === 'solana' && asset !== 'USDC' && asset !== 'SOL') {
        return res.status(400).json({ error: 'Invalid asset for Solana. Use USDC or SOL' });
      }

      const payToken = await storage.getPaidCallToken(payTokenId);
      if (!payToken) {
        return res.status(404).json({ error: 'Pay token not found' });
      }

      if (payToken.status === 'paid' || payToken.status === 'used') {
        return res.status(400).json({ error: 'Token already paid' });
      }

      const recipientWallet = policyStore.getWalletVerification(payToken.creatorAddress);
      const requiredWalletType = chain === 'solana' ? 'solana' : 'ethereum';
      
      if (!recipientWallet || recipientWallet.wallet_type !== requiredWalletType) {
        return res.status(400).json({ 
          error: `Recipient has no verified ${chain === 'solana' ? 'Solana' : 'EVM'} wallet` 
        });
      }

      const amountUsd = payToken.amountCents / 100;
      let amountAsset: string;

      if (chain === 'base') {
        if (asset === 'USDC') {
          amountAsset = cryptoPayments.calculateUsdcAmount(amountUsd);
        } else {
          const ethAmount = await cryptoPayments.calculateEthAmount(amountUsd);
          if (!ethAmount) {
            return res.status(400).json({ error: 'ETH price unavailable. Try USDC instead.' });
          }
          amountAsset = ethAmount;
        }
      } else {
        if (asset === 'USDC') {
          amountAsset = solanaPayments.calculateSolanaUsdcAmount(amountUsd);
        } else {
          const solAmount = await solanaPayments.calculateSolAmount(amountUsd);
          if (!solAmount) {
            return res.status(400).json({ error: 'SOL price unavailable. Try USDC instead.' });
          }
          amountAsset = solAmount;
        }
      }

      const invoice = await storage.createCryptoInvoice({
        payTokenId: payToken.token,
        recipientCallId: payToken.creatorAddress,
        recipientWallet: recipientWallet.wallet_address,
        payerCallId: payerCallId || null,
        chain,
        asset,
        amountUsd,
        amountAsset,
        status: 'pending',
        expiresAt: cryptoPayments.calculateInvoiceExpiry(),
      });

      res.json({
        invoiceId: invoice.id,
        recipientWallet: invoice.recipientWallet,
        chain: invoice.chain,
        asset: invoice.asset,
        amountAsset: invoice.amountAsset,
        amountUsd: invoice.amountUsd,
        expiresAt: invoice.expiresAt,
      });
    } catch (error) {
      console.error('Error creating crypto invoice:', error);
      res.status(500).json({ error: 'Failed to create crypto invoice' });
    }
  });

  app.post('/api/crypto-invoice/confirm', async (req, res) => {
    try {
      const { invoiceId, txHash } = req.body;

      if (!invoiceId || !txHash) {
        return res.status(400).json({ error: 'Missing required fields: invoiceId, txHash' });
      }

      const invoice = await storage.getCryptoInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.chain === 'base' && !cryptoPayments.isCryptoPaymentsEnabled()) {
        return res.status(400).json({ error: 'Base crypto payments are disabled' });
      }

      if (invoice.chain === 'solana' && !solanaPayments.isSolanaPaymentsEnabled()) {
        return res.status(400).json({ error: 'Solana payments are disabled' });
      }

      if (invoice.chain === 'base' && !cryptoPayments.isValidTxHash(txHash)) {
        return res.status(400).json({ error: 'Invalid transaction hash format' });
      }

      if (invoice.chain === 'solana' && !solanaPayments.isValidSolanaTxSignature(txHash)) {
        return res.status(400).json({ error: 'Invalid Solana transaction signature format' });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({ error: 'Invoice already paid' });
      }

      if (invoice.status === 'expired' || new Date(invoice.expiresAt) < new Date()) {
        await storage.updateCryptoInvoice(invoiceId, { status: 'expired' });
        return res.status(400).json({ error: 'Invoice expired' });
      }

      const existingTx = await storage.getCryptoInvoiceByTxHash(txHash);
      if (existingTx) {
        return res.status(400).json({ error: 'Transaction already used for another invoice' });
      }

      let verification: { success: boolean; error?: string };

      if (invoice.chain === 'solana') {
        if (invoice.asset === 'SOL') {
          verification = await solanaPayments.verifySolPayment(
            txHash,
            invoice.recipientWallet,
            invoice.amountAsset
          );
        } else {
          verification = await solanaPayments.verifySolanaUsdcPayment(
            txHash,
            invoice.recipientWallet,
            invoice.amountAsset
          );
        }
      } else {
        if (invoice.asset === 'ETH') {
          verification = await cryptoPayments.verifyEthPayment(
            txHash,
            invoice.recipientWallet,
            invoice.amountAsset
          );
        } else {
          verification = await cryptoPayments.verifyUsdcPayment(
            txHash,
            invoice.recipientWallet,
            invoice.amountAsset
          );
        }
      }

      if (!verification.success) {
        await storage.updateCryptoInvoice(invoiceId, { status: 'failed' });
        return res.status(400).json({ error: verification.error || 'Payment verification failed' });
      }

      await storage.updateCryptoInvoice(invoiceId, {
        status: 'paid',
        txHash,
        paidAt: new Date(),
      });

      const payToken = await storage.getPaidCallToken(invoice.payTokenId);
      if (payToken) {
        await storage.updatePaidCallToken(payToken.id, {
          status: 'paid',
          paymentIntentId: `crypto:${invoice.chain}:${txHash}`,
        });
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        invoiceId: invoice.id,
        txHash,
      });
    } catch (error) {
      console.error('Error confirming crypto invoice:', error);
      res.status(500).json({ error: 'Failed to confirm crypto payment' });
    }
  });

  app.get('/api/crypto-invoice/:id', async (req, res) => {
    try {
      const invoice = await storage.getCryptoInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.status === 'pending' && new Date(invoice.expiresAt) < new Date()) {
        await storage.updateCryptoInvoice(invoice.id, { status: 'expired' });
        invoice.status = 'expired';
      }

      res.json(invoice);
    } catch (error) {
      console.error('Error getting crypto invoice:', error);
      res.status(500).json({ error: 'Failed to get invoice' });
    }
  });

  app.get('/api/crypto/recipient-wallet/:address', async (req, res) => {
    try {
      const { chain } = req.query;
      const wallet = policyStore.getWalletVerification(req.params.address);
      
      if (chain === 'solana') {
        if (!wallet || wallet.wallet_type !== 'solana') {
          return res.json({ hasWallet: false });
        }
        return res.json({ hasWallet: true, walletAddress: wallet.wallet_address, walletType: 'solana' });
      }
      
      if (!wallet || wallet.wallet_type !== 'ethereum') {
        return res.json({ hasWallet: false });
      }
      res.json({ hasWallet: true, walletAddress: wallet.wallet_address, walletType: 'ethereum' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check wallet' });
    }
  });

  app.get('/api/crypto/recipient-wallets/:address', async (req, res) => {
    try {
      const evmWallet = policyStore.getWalletVerification(req.params.address);
      res.json({
        evm: evmWallet?.wallet_type === 'ethereum' ? evmWallet.wallet_address : null,
        solana: evmWallet?.wallet_type === 'solana' ? evmWallet.wallet_address : null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check wallets' });
    }
  });

  app.get('/api/admin/crypto-invoices', async (req, res) => {
    try {
      const invoices = await storage.getRecentCryptoInvoices(50);
      res.json(invoices);
    } catch (error) {
      console.error('Error getting crypto invoices:', error);
      res.status(500).json({ error: 'Failed to get invoices' });
    }
  });

  // Phase 5: Call Duration Tracking
  app.post('/api/call-duration/start', async (req, res) => {
    try {
      const { callSessionId, creatorAddress, callerAddress, ratePerMinuteCents } = req.body;
      
      const record = await storage.createCallDurationRecord({
        callSessionId,
        creatorAddress,
        callerAddress,
        startTime: new Date(),
        ratePerMinuteCents: ratePerMinuteCents || 0,
        isPaid: !!ratePerMinuteCents,
      });
      
      res.json(record);
    } catch (error) {
      console.error('Error starting call duration:', error);
      res.status(500).json({ error: 'Failed to start call duration tracking' });
    }
  });

  app.post('/api/call-duration/end', async (req, res) => {
    try {
      const { callSessionId } = req.body;
      
      const record = await storage.getCallDurationRecord(callSessionId);
      if (!record) {
        return res.status(404).json({ error: 'Call duration record not found' });
      }
      
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - new Date(record.startTime).getTime()) / 1000);
      const billableMinutes = Math.ceil(durationSeconds / 60);
      const totalAmountCents = (record.ratePerMinuteCents || 0) * billableMinutes;
      
      const updated = await storage.updateCallDurationRecord(record.id, {
        endTime,
        durationSeconds,
        billableMinutes,
        totalAmountCents,
      });
      
      // Also update the call session
      await storage.updateCallSession(callSessionId, {
        endedAt: endTime,
        durationSeconds,
        status: 'ended',
        endReason: 'completed',
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Error ending call duration:', error);
      res.status(500).json({ error: 'Failed to end call duration tracking' });
    }
  });

  // Phase 5: Stripe Publishable Key for Frontend
  app.get('/api/stripe/publishable-key', async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error('Error getting Stripe publishable key:', error);
      res.status(500).json({ error: 'Failed to get Stripe publishable key' });
    }
  });

  // Stripe Subscription Checkout
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const { userAddress, priceId, successUrl, cancelUrl } = req.body;
      
      if (!userAddress || !priceId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const identity = await storage.getIdentity(userAddress);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }

      const stripe = await getUncachableStripeClient();
      
      // Get or create customer
      let customerId = identity.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: identity.email || undefined,
          metadata: { cryptoAddress: userAddress }
        });
        customerId = customer.id;
        await storage.updateStripeCustomer(userAddress, customerId);
      }

      // Get host from request or use default
      const host = req.get('host') || 'localhost:5000';
      const protocol = req.get('x-forwarded-proto') || 'http';
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${baseUrl}/pricing`,
        metadata: { userAddress }
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Create Stripe Customer Portal Session
  app.post('/api/stripe/create-portal-session', async (req, res) => {
    try {
      const { userAddress, returnUrl } = req.body;
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing user address' });
      }

      const identity = await storage.getIdentity(userAddress);
      if (!identity || !identity.stripeCustomerId) {
        return res.status(404).json({ error: 'No Stripe customer found for this user' });
      }

      const stripe = await getUncachableStripeClient();
      
      const host = req.get('host') || 'localhost:5000';
      const protocol = req.get('x-forwarded-proto') || 'http';
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.billingPortal.sessions.create({
        customer: identity.stripeCustomerId,
        return_url: returnUrl || `${baseUrl}/settings`
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  // Verify Stripe Checkout Session
  app.get('/api/billing/verify-session', async (req, res) => {
    try {
      const { session_id } = req.query;
      
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: 'Missing session_id' });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['subscription', 'customer']
      });
      
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Payment not completed' });
      }
      
      const userAddress = session.metadata?.userAddress;
      if (!userAddress) {
        return res.status(400).json({ error: 'Invalid session - missing user' });
      }
      
      const identity = await storage.getIdentity(userAddress);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Determine plan from price
      const subscription = session.subscription as any;
      let plan = 'pro';
      if (subscription?.items?.data?.[0]?.price?.id === process.env.STRIPE_BUSINESS_PRICE_ID) {
        plan = 'business';
      }
      
      // Update user plan if not already updated by webhook
      if (identity.plan !== plan || identity.planStatus !== 'active') {
        await storage.updateIdentity(userAddress, {
          plan,
          planStatus: 'active',
          stripeSubscriptionId: subscription?.id || identity.stripeSubscriptionId
        } as any);
      }
      
      // Send welcome email
      const host = req.get('host') || 'localhost:5000';
      const protocol = req.get('x-forwarded-proto') || 'http';
      const appUrl = process.env.APP_URL || `${protocol}://${host}`;
      
      const customerEmail = (session.customer as any)?.email || identity.email;
      if (customerEmail) {
        const emailContent = generateWelcomeEmail(appUrl, plan.charAt(0).toUpperCase() + plan.slice(1));
        await sendEmail({
          to: customerEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
      }
      
      await storage.createAuditLog({
        actorAddress: userAddress,
        targetAddress: userAddress,
        actionType: 'SUBSCRIPTION_VERIFIED',
        metadata: { plan, sessionId: session_id },
      });
      
      res.json({ 
        success: true, 
        plan: plan.charAt(0).toUpperCase() + plan.slice(1),
        email: customerEmail
      });
    } catch (error) {
      console.error('Error verifying session:', error);
      res.status(500).json({ error: 'Failed to verify session' });
    }
  });

  // Get Premium Access Status
  app.get('/api/premium-access/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const accessStatus = await storage.checkPremiumAccess(address);
      const identity = await storage.getIdentity(address);
      
      res.json({
        ...accessStatus,
        plan: identity?.plan || 'free',
        planStatus: identity?.planStatus || 'none',
        trialStatus: identity?.trialStatus || 'none',
        trialEndAt: identity?.trialEndAt,
        trialMinutesRemaining: identity?.trialMinutesRemaining
      });
    } catch (error) {
      console.error('Error checking premium access:', error);
      res.status(500).json({ error: 'Failed to check premium access' });
    }
  });

  // Get Subscription Plans (hardcoded for now, can be synced from Stripe later)
  app.get('/api/stripe/plans', async (_req, res) => {
    try {
      res.json({
        plans: [
          {
            id: 'free',
            name: 'Free',
            price: 0,
            interval: 'month',
            features: ['Basic video calls', 'Up to 5 contacts', 'Standard quality']
          },
          {
            id: 'pro',
            name: 'Pro',
            price: 900,
            interval: 'month',
            priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
            features: ['Unlimited video calls', 'Unlimited contacts', 'HD quality', 'Creator profile', 'Accept paid calls', 'Priority support']
          },
          {
            id: 'business',
            name: 'Business',
            price: 2900,
            interval: 'month',
            priceId: process.env.STRIPE_BUSINESS_PRICE_ID || 'price_business_monthly',
            features: ['Everything in Pro', 'Team management', 'Analytics dashboard', 'Custom branding', 'API access', 'Dedicated support']
          }
        ]
      });
    } catch (error) {
      console.error('Error fetching plans:', error);
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  // ============================================
  // PLATFORM-SPECIFIC BILLING API (ADD ONLY)
  // Web uses Stripe (unchanged), Android uses Google Play, iOS uses Apple IAP
  // ============================================

  // Default pricing config (seeded on startup if not in DB)
  const DEFAULT_PLATFORM_PRICING = [
    {
      planId: 'free',
      planName: 'Free',
      priceWebCents: 0,
      priceAndroidCents: 0,
      priceIosCents: 0,
      interval: 'month',
      features: ['Basic video calls', 'Up to 5 contacts', 'Standard quality'],
      displayOrder: 0,
    },
    {
      planId: 'pro',
      planName: 'Pro',
      priceWebCents: 900,
      priceAndroidCents: 699, // Discounted for Android
      priceIosCents: 999, // iOS may have different pricing
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
      googlePlayProductId: 'cv_pro_monthly',
      appleProductId: 'cv.pro.monthly',
      interval: 'month',
      features: ['Unlimited video calls', 'Unlimited contacts', 'HD quality', 'Creator profile', 'Accept paid calls', 'Priority support'],
      displayOrder: 1,
    },
    {
      planId: 'business',
      planName: 'Business',
      priceWebCents: 2900,
      priceAndroidCents: 1499, // Discounted for Android
      priceIosCents: 2999,
      stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID || 'price_business_monthly',
      googlePlayProductId: 'cv_business_monthly',
      appleProductId: 'cv.business.monthly',
      interval: 'month',
      features: ['Everything in Pro', 'Team management', 'Analytics dashboard', 'Custom branding', 'API access', 'Dedicated support'],
      displayOrder: 2,
    },
  ];

  // Seed platform pricing on startup
  async function seedPlatformPricing() {
    try {
      const existing = await storage.getPlatformPricing();
      if (existing.length === 0) {
        console.log('Seeding platform pricing...');
        for (const pricing of DEFAULT_PLATFORM_PRICING) {
          await storage.upsertPlatformPricing(pricing as any);
        }
        console.log('Platform pricing seeded successfully');
      }
    } catch (error) {
      console.error('Error seeding platform pricing:', error);
    }
  }
  seedPlatformPricing();

  // GET /api/billing/plans?platform=<web|android|ios>
  // Returns plan info with platform-correct pricing and purchase method
  app.get('/api/billing/plans', async (req, res) => {
    try {
      const platform = (req.query.platform as string) || 'web';
      const validPlatforms = ['web', 'android', 'ios'];
      
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ error: 'Invalid platform. Use: web, android, or ios' });
      }
      
      const pricingData = await storage.getPlatformPricing();
      
      // If no DB data, use defaults
      const plans = pricingData.length > 0 ? pricingData : DEFAULT_PLATFORM_PRICING;
      
      const formattedPlans = plans.map((plan: any) => {
        let price: number;
        let purchaseMethod: string;
        let productId: string | undefined;
        
        switch (platform) {
          case 'android':
            price = plan.priceAndroidCents || plan.priceWebCents;
            purchaseMethod = plan.planId === 'free' ? 'none' : 'google_play';
            productId = plan.googlePlayProductId;
            break;
          case 'ios':
            price = plan.priceIosCents || plan.priceWebCents;
            purchaseMethod = plan.planId === 'free' ? 'none' : 'apple_iap';
            productId = plan.appleProductId;
            break;
          default: // web
            price = plan.priceWebCents;
            purchaseMethod = plan.planId === 'free' ? 'none' : 'stripe';
            productId = plan.stripePriceId;
        }
        
        return {
          id: plan.planId,
          name: plan.planName,
          price, // In cents
          priceDisplay: price === 0 ? 'Free' : `$${(price / 100).toFixed(2)}/mo`,
          interval: plan.interval || 'month',
          features: plan.features || [],
          purchaseMethod,
          productId,
          platform,
        };
      });
      
      res.json({ plans: formattedPlans, platform });
    } catch (error) {
      console.error('Error fetching billing plans:', error);
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  // POST /api/billing/activate
  // Accepts provider receipt payload and activates entitlement (server-verified)
  // This is a stub for Google Play / Apple IAP verification - implement fully when integrating stores
  app.post('/api/billing/activate', async (req, res) => {
    try {
      const { 
        userAddress, 
        provider, // 'stripe' | 'google_play' | 'apple_iap'
        planId,   // 'pro' | 'business'
        purchaseToken, // For Google Play
        transactionId, // Provider-specific transaction ID
        receipt,  // For Apple IAP
      } = req.body;
      
      if (!userAddress || !provider || !planId) {
        return res.status(400).json({ error: 'Missing required fields: userAddress, provider, planId' });
      }
      
      const validProviders = ['stripe', 'google_play', 'apple_iap'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider. Use: stripe, google_play, or apple_iap' });
      }
      
      const validPlans = ['pro', 'business'];
      if (!validPlans.includes(planId)) {
        return res.status(400).json({ error: 'Invalid plan. Use: pro or business' });
      }
      
      const identity = await storage.getIdentity(userAddress);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Check for duplicate transaction
      if (transactionId) {
        const existingPurchase = await storage.getSubscriptionPurchaseByTransaction(provider, transactionId);
        if (existingPurchase) {
          return res.status(409).json({ error: 'Transaction already processed' });
        }
      }
      
      // For Stripe, we already have webhook handling - this endpoint is mainly for mobile stores
      if (provider === 'stripe') {
        return res.status(400).json({ 
          error: 'Stripe subscriptions should use /api/stripe/create-checkout-session and webhooks' 
        });
      }
      
      // For Google Play: Verify purchase with Google Play Developer API
      // SECURITY: Do NOT activate until server-side verification is implemented
      if (provider === 'google_play') {
        if (!purchaseToken) {
          return res.status(400).json({ error: 'Missing purchaseToken for Google Play verification' });
        }
        
        // TODO: Implement actual Google Play verification using Google Play Developer API
        // const isValid = await verifyGooglePlayPurchase(purchaseToken, productId);
        // Until verification is implemented, reject all Google Play activations
        console.log(`[BILLING] Google Play activation REJECTED (no verification): user=${userAddress}, plan=${planId}`);
        return res.status(501).json({ 
          error: 'Google Play verification not yet implemented',
          message: 'Mobile billing is coming soon. Please use the web version to subscribe.' 
        });
      }
      
      // For Apple IAP: Verify receipt with Apple
      // SECURITY: Do NOT activate until server-side verification is implemented
      if (provider === 'apple_iap') {
        if (!receipt) {
          return res.status(400).json({ error: 'Missing receipt for Apple IAP verification' });
        }
        
        // TODO: Implement actual Apple receipt verification using App Store Server API
        console.log(`[BILLING] Apple IAP activation REJECTED (no verification): user=${userAddress}, plan=${planId}`);
        return res.status(501).json({ 
          error: 'Apple IAP verification not yet implemented',
          message: 'Mobile billing is coming soon. Please use the web version to subscribe.' 
        });
      }
      
      // This point should not be reached (Stripe is rejected above, Google/Apple return 501)
      return res.status(400).json({ error: 'Unknown provider' });
    } catch (error) {
      console.error('Error activating subscription:', error);
      res.status(500).json({ error: 'Failed to activate subscription' });
    }
  });

  // ============================================
  // ADMIN CONSOLE API ROUTES (Phase 6)
  // ============================================

  // Founder seeding on startup
  // FOUNDER_PUBKEYS: Comma-separated list of public keys (supports multiple devices)
  // FOUNDER_PUBKEY: Single public key (legacy, still supported)
  // FOUNDER_ADDRESS: Legacy support for full address matching
  const FOUNDER_PUBKEYS_RAW = process.env.FOUNDER_PUBKEYS || process.env.FOUNDER_PUBKEY || '';
  const FOUNDER_PUBKEYS = FOUNDER_PUBKEYS_RAW.split(',').map(k => k.trim()).filter(k => k.length > 0);
  const FOUNDER_ADDRESS = process.env.FOUNDER_ADDRESS;
  
  // Extract public key from address format: call:<pubkey>:<random>
  function extractPubkeyFromAddress(address: string): string | null {
    if (!address.startsWith('call:')) return null;
    const parts = address.split(':');
    if (parts.length >= 2) {
      return parts[1]; // The public key portion
    }
    return null;
  }
  
  // Check if an address matches any founder (by pubkey or full address)
  function isFounderAddress(address: string): boolean {
    if (FOUNDER_PUBKEYS.length > 0) {
      const pubkey = extractPubkeyFromAddress(address);
      if (pubkey && FOUNDER_PUBKEYS.includes(pubkey)) {
        return true;
      }
    }
    if (FOUNDER_ADDRESS) {
      return address === FOUNDER_ADDRESS;
    }
    return false;
  }
  
  async function seedFounder() {
    if (FOUNDER_PUBKEYS.length === 0 && !FOUNDER_ADDRESS) return;
    
    // If using pubkeys, we can't seed until we see matching addresses
    if (FOUNDER_PUBKEYS.length > 0) {
      console.log(`Founder pubkeys configured: ${FOUNDER_PUBKEYS.length} keys - will be promoted on registration`);
      FOUNDER_PUBKEYS.forEach((pk, i) => console.log(`  Founder ${i + 1}: ${pk.slice(0, 8)}...`));
      return;
    }
    
    if (FOUNDER_ADDRESS) {
      const identity = await storage.getIdentity(FOUNDER_ADDRESS);
      if (identity && identity.role !== 'founder') {
        await storage.updateIdentity(FOUNDER_ADDRESS, { role: 'founder' } as any);
        console.log(`Promoted ${FOUNDER_ADDRESS} to founder role`);
      } else if (!identity) {
        console.log(`Founder address ${FOUNDER_ADDRESS} not found in database yet - will be promoted on first registration`);
      }
    }
  }
  
  seedFounder().catch(console.error);

  // Admin auth middleware with RBAC support
  async function requireAdmin(req: any, res: any, next: any) {
    const actorAddress = req.headers['x-admin-address'] as string;
    const signature = req.headers['x-admin-signature'] as string;
    const timestamp = parseInt(req.headers['x-admin-timestamp'] as string);
    
    if (!actorAddress || !signature || !timestamp) {
      return res.status(401).json({ error: 'Missing admin authentication headers' });
    }
    
    // Check timestamp freshness (5 minute window for admin actions)
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'Admin request expired' });
    }
    
    const identity = await storage.getIdentity(actorAddress);
    if (!identity) {
      return res.status(403).json({ error: 'Identity not found' });
    }
    
    if (identity.isDisabled) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Check if identity has an admin-level role using RBAC
    const { RBAC } = await import('./rbac');
    if (!RBAC.isAdminRole(identity.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Check admin expiration
    if (identity.adminExpiresAt && new Date(identity.adminExpiresAt) < new Date()) {
      return res.status(403).json({ error: 'Admin access has expired' });
    }

    // Check user status
    if ((identity as any).status === 'suspended' || (identity as any).status === 'soft_banned') {
      return res.status(403).json({ error: 'Account is suspended' });
    }
    
    // Verify signature
    try {
      const message = `admin:${actorAddress}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(identity.publicKeyBase58);
      
      const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid admin signature' });
      }
    } catch (error) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }
    
    req.adminIdentity = identity;
    req.adminPermissions = await RBAC.getUserEffectivePermissions(actorAddress);
    next();
  }

  // Require specific permission(s)
  function requirePermission(...permissions: string[]) {
    return async (req: any, res: any, next: any) => {
      await requireAdmin(req, res, async () => {
        const { RBAC } = await import('./rbac');
        const hasAny = await RBAC.hasAnyPermission(req.adminIdentity.address, permissions as any);
        if (!hasAny) {
          return res.status(403).json({ 
            error: 'Insufficient permissions', 
            required: permissions 
          });
        }
        next();
      });
    };
  }

  // Require specific role level or higher
  function requireRole(minRole: string) {
    return async (req: any, res: any, next: any) => {
      await requireAdmin(req, res, async () => {
        const { RBAC } = await import('./rbac');
        if (!RBAC.isRoleHigherOrEqual(req.adminIdentity.role, minRole)) {
          return res.status(403).json({ 
            error: `Role '${minRole}' or higher required` 
          });
        }
        next();
      });
    };
  }

  // Legacy requireFounder - now maps to ultra_god_admin
  async function requireFounder(req: any, res: any, next: any) {
    await requireAdmin(req, res, () => {
      const role = req.adminIdentity?.role;
      if (role !== 'founder' && role !== 'ultra_god_admin') {
        return res.status(403).json({ error: 'Owner access required' });
      }
      next();
    });
  }

  // Admin Dashboard Stats
  app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    try {
      const totalUsers = await storage.countIdentities();
      const allIdentities = await storage.getAllIdentities({ limit: 10000 });
      const activeTrials = allIdentities.filter(i => i.trialStatus === 'active').length;
      const disabledUsers = allIdentities.filter(i => i.isDisabled).length;
      
      res.json({
        totalUsers,
        activeTrials,
        disabledUsers,
        admins: allIdentities.filter(i => i.role === 'admin' || i.role === 'founder').length,
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // List all users
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const users = await storage.getAllIdentities({ search, limit, offset });
      const total = await storage.countIdentities();
      
      res.json({ users, total, limit, offset });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Get single user details
  app.get('/api/admin/users/:address', requireAdmin, async (req, res) => {
    try {
      const { address } = req.params;
      const identity = await storage.getIdentity(address);
      
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get call stats
      const callHistory = await storage.getCallHistory(address, 100);
      const callCount = callHistory.length;
      
      res.json({ 
        user: identity, 
        stats: { callCount }
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  });

  // Update user role (founder only for promoting to admin/founder)
  app.put('/api/admin/users/:address/role', async (req, res) => {
    const actorAddress = req.headers['x-admin-address'] as string;
    const { role } = req.body;
    const { address } = req.params;
    
    // Validate role is a valid value
    const validRoles = ['user', 'admin', 'founder'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: user, admin, or founder' });
    }
    
    // Only founder can assign admin or founder roles
    if (role === 'admin' || role === 'founder') {
      await requireFounder(req, res, async () => {
        try {
          const updated = await storage.updateIdentityRole(address, role, actorAddress);
          if (!updated) {
            return res.status(404).json({ error: 'User not found' });
          }
          console.log(`User ${address} promoted to ${role} by ${actorAddress}`);
          res.json(updated);
        } catch (error) {
          console.error('Error updating user role:', error);
          res.status(500).json({ error: 'Failed to update user role' });
        }
      });
    } else {
      // Demoting to user can be done by any admin
      await requireAdmin(req, res, async () => {
        try {
          const updated = await storage.updateIdentityRole(address, role, actorAddress);
          if (!updated) {
            return res.status(404).json({ error: 'User not found' });
          }
          res.json(updated);
        } catch (error) {
          console.error('Error updating user role:', error);
          res.status(500).json({ error: 'Failed to update user role' });
        }
      });
    }
  });

  // Enable/disable user
  app.put('/api/admin/users/:address/status', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { disabled } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const updated = await storage.setIdentityDisabled(address, disabled, actorAddress);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Grant trial to user
  app.post('/api/admin/users/:address/trial', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { trialDays, trialMinutes } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      if (!trialDays && !trialMinutes) {
        return res.status(400).json({ error: 'Must specify trialDays or trialMinutes' });
      }
      
      const updated = await storage.grantTrial(address, trialDays, trialMinutes, actorAddress);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error granting trial:', error);
      res.status(500).json({ error: 'Failed to grant trial' });
    }
  });

  // Check trial access for a user
  app.get('/api/admin/users/:address/trial', requireAdmin, async (req, res) => {
    try {
      const { address } = req.params;
      const access = await storage.checkTrialAccess(address);
      res.json(access);
    } catch (error) {
      console.error('Error checking trial access:', error);
      res.status(500).json({ error: 'Failed to check trial access' });
    }
  });

  // Impersonation start (founder only)
  app.post('/api/admin/impersonate/:address', requireFounder, async (req: any, res) => {
    try {
      const { address } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      const target = await storage.getIdentity(address);
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'IMPERSONATE_START',
        metadata: {}
      });
      
      // Return target identity data for impersonation
      res.json({ 
        success: true, 
        impersonating: target,
        message: 'Impersonation started - use this identity data client-side'
      });
    } catch (error) {
      console.error('Error starting impersonation:', error);
      res.status(500).json({ error: 'Failed to start impersonation' });
    }
  });

  // Impersonation end (founder only)
  app.post('/api/admin/impersonate/:address/end', requireFounder, async (req: any, res) => {
    try {
      const { address } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'IMPERSONATE_END',
        metadata: {}
      });
      
      res.json({ success: true, message: 'Impersonation ended' });
    } catch (error) {
      console.error('Error ending impersonation:', error);
      res.status(500).json({ error: 'Failed to end impersonation' });
    }
  });

  // Get audit logs
  app.get('/api/admin/audit-logs', requireAdmin, async (req, res) => {
    try {
      const actorAddress = req.query.actor as string | undefined;
      const targetAddress = req.query.target as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const logs = await storage.getAuditLogs({ actorAddress, targetAddress, limit });
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Admin endpoint to set user tier (J)
  app.post('/api/admin/users/:address/tier', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { tier } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      if (!tier || !['free', 'paid', 'admin'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be: free, paid, or admin' });
      }
      
      const updated = await storage.setUserTier(address, tier, actorAddress);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ success: true, tier, address });
    } catch (error) {
      console.error('Error setting user tier:', error);
      res.status(500).json({ error: 'Failed to set user tier' });
    }
  });

  // Admin endpoint to set comped status (perpetual Pro without billing)
  app.post('/api/admin/users/:address/comped', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { isComped } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      if (typeof isComped !== 'boolean') {
        return res.status(400).json({ error: 'isComped must be a boolean' });
      }
      
      const updated = await storage.setCompedStatus(address, isComped, actorAddress);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ success: true, isComped, address });
    } catch (error) {
      console.error('Error setting comped status:', error);
      res.status(500).json({ error: 'Failed to set comped status' });
    }
  });

  // Admin endpoint to get all usage stats
  app.get('/api/admin/usage-stats', requireAdmin, async (_req, res) => {
    try {
      const usageCounters = await storage.getAllUsageCounters(200);
      const activeCalls = await storage.getAllActiveCalls();
      
      // Calculate estimated costs (TURN usage if enabled)
      const turnEnabled = !!process.env.TURN_URL;
      const relayCallsToday = usageCounters.reduce((sum, c) => sum + (c.relayCalls24h || 0), 0);
      const estimatedTurnCostCents = turnEnabled ? relayCallsToday * 2 : 0; // ~$0.02 per relay call estimate
      
      res.json({
        usageCounters,
        activeCalls,
        summary: {
          totalActiveUsers: usageCounters.length,
          totalActiveCalls: activeCalls.length,
          totalCallsToday: usageCounters.reduce((sum, c) => sum + (c.callsStartedToday || 0), 0),
          totalMinutesThisMonth: Math.floor(usageCounters.reduce((sum, c) => sum + (c.secondsUsedMonth || 0), 0) / 60),
          totalRelayCallsToday: relayCallsToday,
          turnEnabled,
          estimatedTurnCostCents,
        }
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
  });

  // ============================================
  // ADMIN MODE & ENTITLEMENT OVERRIDES (Phase 5)
  // ============================================

  // Admin endpoint to get user's mode settings
  app.get('/api/admin/users/:address/mode', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const modeSettings = await storage.getUserModeSettings(address);
      const identity = await storage.getIdentity(address);
      
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { getAvailableModesForPlan } = await import('./entitlements');
      const availableModes = getAvailableModesForPlan(identity.plan);
      
      res.json({
        address,
        mode: modeSettings?.mode || 'personal',
        flags: modeSettings?.flags || {},
        plan: identity.plan,
        availableModes,
      });
    } catch (error) {
      console.error('Error fetching user mode:', error);
      res.status(500).json({ error: 'Failed to fetch user mode' });
    }
  });

  // Admin endpoint to set user's mode (bypasses plan restrictions)
  app.post('/api/admin/users/:address/mode', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { mode, reason } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      if (!mode || !['personal', 'creator', 'business', 'stage'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Admin bypass: allow setting any mode regardless of plan
      const updated = await storage.createOrUpdateUserModeSettings(address, mode);
      
      // Log admin action
      console.log(`[ADMIN] ${actorAddress} set mode for ${address} to ${mode}. Reason: ${reason || 'N/A'}`);
      
      res.json({
        success: true,
        address,
        mode: updated.mode,
        flags: updated.flags,
      });
    } catch (error) {
      console.error('Error setting user mode:', error);
      res.status(500).json({ error: 'Failed to set user mode' });
    }
  });

  // Admin endpoint to get user's entitlement overrides
  app.get('/api/admin/users/:address/entitlement-overrides', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const overrides = await storage.getUserEntitlementOverrides(address);
      
      res.json({
        address,
        overrides: overrides || [],
      });
    } catch (error) {
      console.error('Error fetching entitlement overrides:', error);
      res.status(500).json({ error: 'Failed to fetch entitlement overrides' });
    }
  });

  // Admin endpoint to set entitlement override
  app.post('/api/admin/users/:address/entitlement-overrides', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { featureKey, value, expiresAt, reason } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      if (!featureKey || value === undefined) {
        return res.status(400).json({ error: 'featureKey and value are required' });
      }
      
      // Validate featureKey against known registry
      const { isValidEntitlementKey, VALID_ENTITLEMENT_KEYS } = await import('./entitlements');
      if (!isValidEntitlementKey(featureKey)) {
        return res.status(400).json({ 
          error: 'Invalid featureKey',
          validKeys: Array.from(VALID_ENTITLEMENT_KEYS),
        });
      }
      
      // Validate value type based on featureKey
      const numericKeys = ['maxCallIds', 'maxGroupParticipants', 'maxCallMinutesPerMonth', 'maxCallsPerDay', 'maxCallDurationMinutes'];
      const booleanKeys = ['allowCallWaiting', 'allowCallMerge', 'allowPaidCalls', 'allowRoutingRules', 'allowDelegation', 'allowStageRooms', 'allowRecording', 'allowGroupCalls'];
      
      if (numericKeys.includes(featureKey)) {
        if (value !== null && (typeof value !== 'number' || value < 0)) {
          return res.status(400).json({ 
            error: `${featureKey} must be a non-negative number or null`,
          });
        }
      } else if (booleanKeys.includes(featureKey)) {
        if (typeof value !== 'boolean') {
          return res.status(400).json({ 
            error: `${featureKey} must be a boolean`,
          });
        }
      }
      
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const override = await storage.setUserEntitlementOverride(
        address,
        featureKey,
        value,
        actorAddress,
        expiresAt ? new Date(expiresAt) : undefined,
        reason
      );
      
      console.log(`[ADMIN] ${actorAddress} set entitlement override for ${address}: ${featureKey}=${JSON.stringify(value)}. Reason: ${reason || 'N/A'}`);
      
      res.json({
        success: true,
        override,
      });
    } catch (error) {
      console.error('Error setting entitlement override:', error);
      res.status(500).json({ error: 'Failed to set entitlement override' });
    }
  });

  // Admin endpoint to delete entitlement override
  app.delete('/api/admin/users/:address/entitlement-overrides/:featureKey', requireAdmin, async (req: any, res) => {
    try {
      const { address, featureKey } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      await storage.deleteUserEntitlementOverride(address, featureKey);
      
      console.log(`[ADMIN] ${actorAddress} deleted entitlement override for ${address}: ${featureKey}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting entitlement override:', error);
      res.status(500).json({ error: 'Failed to delete entitlement override' });
    }
  });

  // Admin endpoint to get effective entitlements for a user
  app.get('/api/admin/users/:address/entitlements', requireAdmin, async (req: any, res) => {
    try {
      const { address } = req.params;
      const { getEffectiveEntitlements, initializeEntitlements } = await import('./entitlements');
      
      await initializeEntitlements();
      const entitlements = await getEffectiveEntitlements(address);
      
      res.json({
        address,
        entitlements,
      });
    } catch (error) {
      console.error('Error fetching effective entitlements:', error);
      res.status(500).json({ error: 'Failed to fetch effective entitlements' });
    }
  });

  // ============================================
  // ENHANCED ADMIN SYSTEM (RBAC, Sessions, etc.)
  // ============================================

  // Get admin's own permissions
  app.get('/api/admin/me/permissions', requireAdmin, async (req: any, res) => {
    try {
      res.json({
        address: req.adminIdentity.address,
        role: req.adminIdentity.role,
        permissions: req.adminPermissions || [],
      });
    } catch (error) {
      console.error('Error fetching admin permissions:', error);
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  });

  // List all admins (requires admins.read)
  app.get('/api/admin/admins', requirePermission('admins.read'), async (_req, res) => {
    try {
      const { RBAC } = await import('./rbac');
      const allIdentities = await storage.getAllIdentities({ limit: 10000 });
      const admins = allIdentities.filter(i => RBAC.isAdminRole(i.role));
      
      const adminsWithPerms = await Promise.all(admins.map(async (admin) => {
        const perms = await storage.getAdminPermissions(admin.address);
        return {
          ...admin,
          effectivePermissions: await RBAC.getUserEffectivePermissions(admin.address),
          customPermissions: perms?.permissions || [],
          permissionsExpireAt: perms?.expiresAt,
        };
      }));
      
      res.json(adminsWithPerms);
    } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({ error: 'Failed to fetch admins' });
    }
  });

  // Grant admin role (requires admins.create)
  app.post('/api/admin/admins/:address', requirePermission('admins.create'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const { role, permissions, expiresAt } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const { RBAC } = await import('./rbac');
      
      // Check if actor can grant this role
      if (!(await RBAC.canManageRole(actorAddress, role))) {
        return res.status(403).json({ error: 'Cannot grant a role equal or higher than your own' });
      }
      
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Update role
      await storage.updateIdentity(address, { 
        role,
        adminExpiresAt: expiresAt ? new Date(expiresAt) : null,
      } as any);
      
      // Set custom permissions if provided
      if (permissions && permissions.length > 0) {
        await storage.setAdminPermissions({
          userAddress: address,
          permissions,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          grantedBy: actorAddress,
        });
      }
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'GRANT_ADMIN',
        metadata: { role, permissions, expiresAt },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error granting admin:', error);
      res.status(500).json({ error: 'Failed to grant admin role' });
    }
  });

  // Revoke admin role (requires admins.manage)
  app.delete('/api/admin/admins/:address', requirePermission('admins.manage'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      const { RBAC } = await import('./rbac');
      
      if (!(await RBAC.canEditUser(actorAddress, address))) {
        return res.status(403).json({ error: 'Cannot revoke admin from this user' });
      }
      
      await storage.updateIdentity(address, { role: 'user' } as any);
      await storage.deleteAdminPermissions(address);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'REVOKE_ADMIN',
        metadata: {},
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error revoking admin:', error);
      res.status(500).json({ error: 'Failed to revoke admin role' });
    }
  });

  // Update admin permissions (requires admins.manage)
  app.put('/api/admin/admins/:address/permissions', requirePermission('admins.manage'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const { permissions, expiresAt } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const { RBAC } = await import('./rbac');
      if (!(await RBAC.canEditUser(actorAddress, address))) {
        return res.status(403).json({ error: 'Cannot modify this admin' });
      }
      
      await storage.setAdminPermissions({
        userAddress: address,
        permissions: permissions || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        grantedBy: actorAddress,
      });
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'UPDATE_PERMISSIONS',
        metadata: { permissions, expiresAt },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating permissions:', error);
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  });

  // Suspend user (requires users.suspend)
  app.post('/api/admin/users/:address/suspend', requirePermission('users.suspend'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const { reason } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const { RBAC } = await import('./rbac');
      if (!(await RBAC.canEditUser(actorAddress, address))) {
        return res.status(403).json({ error: 'Cannot suspend this user' });
      }
      
      await storage.suspendUser(address, reason || 'No reason provided', actorAddress);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'SUSPEND_USER',
        metadata: { reason },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error suspending user:', error);
      res.status(500).json({ error: 'Failed to suspend user' });
    }
  });

  // Unsuspend user (requires users.suspend)
  app.post('/api/admin/users/:address/unsuspend', requirePermission('users.suspend'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      await storage.unsuspendUser(address);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'UNSUSPEND_USER',
        metadata: {},
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error unsuspending user:', error);
      res.status(500).json({ error: 'Failed to unsuspend user' });
    }
  });

  // Grant free access (requires access.grant)
  app.post('/api/admin/users/:address/free-access', requirePermission('access.grant'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const { days } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const endAt = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000);
      await storage.grantFreeAccess(address, endAt, actorAddress);
      
      res.json({ success: true, freeAccessEndAt: endAt });
    } catch (error) {
      console.error('Error granting free access:', error);
      res.status(500).json({ error: 'Failed to grant free access' });
    }
  });

  // System Settings
  app.get('/api/admin/settings', requirePermission('system.settings'), async (_req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/admin/settings/:key', requirePermission('system.settings'), async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const setting = await storage.setSystemSetting(key, value, actorAddress, description);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: key,
        actionType: 'SYSTEM_SETTING_CHANGE',
        metadata: { key, value },
      });
      
      res.json(setting);
    } catch (error) {
      console.error('Error updating setting:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  // Promo Codes
  app.get('/api/admin/promo-codes', requirePermission('access.trials'), async (_req, res) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
      res.status(500).json({ error: 'Failed to fetch promo codes' });
    }
  });

  app.post('/api/admin/promo-codes', requirePermission('access.trials'), async (req: any, res) => {
    try {
      const { code, type, trialDays, trialMinutes, grantPlan, discountPercent, maxUses, expiresAt } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const promoCode = await storage.createPromoCode({
        code: code.toUpperCase(),
        type: type || 'trial',
        trialDays,
        trialMinutes,
        grantPlan,
        discountPercent,
        maxUses: maxUses || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: actorAddress,
      });
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: code,
        actionType: 'CREATE_PROMO_CODE',
        metadata: { code, type, trialDays, maxUses },
      });
      
      res.json(promoCode);
    } catch (error) {
      console.error('Error creating promo code:', error);
      res.status(500).json({ error: 'Failed to create promo code' });
    }
  });

  // IP Blocklist
  app.get('/api/admin/ip-blocklist', requirePermission('blocklist.manage'), async (_req, res) => {
    try {
      const blocked = await storage.getAllBlockedIps();
      res.json(blocked);
    } catch (error) {
      console.error('Error fetching blocklist:', error);
      res.status(500).json({ error: 'Failed to fetch blocklist' });
    }
  });

  app.post('/api/admin/ip-blocklist', requirePermission('blocklist.manage'), async (req: any, res) => {
    try {
      const { ipAddress, reason, expiresAt } = req.body;
      const actorAddress = req.adminIdentity.address;
      
      const entry = await storage.blockIp(ipAddress, reason, actorAddress, expiresAt ? new Date(expiresAt) : undefined);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: ipAddress,
        actionType: 'BLOCK_IP',
        metadata: { ipAddress, reason },
      });
      
      res.json(entry);
    } catch (error) {
      console.error('Error blocking IP:', error);
      res.status(500).json({ error: 'Failed to block IP' });
    }
  });

  app.delete('/api/admin/ip-blocklist/:ip', requirePermission('blocklist.manage'), async (req: any, res) => {
    try {
      const ipAddress = req.params.ip;
      const actorAddress = req.adminIdentity.address;
      
      await storage.unblockIp(ipAddress);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: ipAddress,
        actionType: 'UNBLOCK_IP',
        metadata: {},
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error unblocking IP:', error);
      res.status(500).json({ error: 'Failed to unblock IP' });
    }
  });

  // Admin Sessions
  app.get('/api/admin/sessions', requirePermission('security.read'), async (req: any, res) => {
    try {
      const sessions = await storage.getAdminSessionsForUser(req.adminIdentity.address);
      res.json(sessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  app.delete('/api/admin/sessions/:token', requirePermission('security.write'), async (req: any, res) => {
    try {
      const { token } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      await storage.revokeAdminSession(token);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: token,
        actionType: 'REVOKE_SESSION',
        metadata: {},
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error revoking session:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });

  // Revoke all sessions for a user (requires security.write)
  app.delete('/api/admin/users/:address/sessions', requirePermission('security.write'), async (req: any, res) => {
    try {
      const { address } = req.params;
      const actorAddress = req.adminIdentity.address;
      
      const count = await storage.revokeAllAdminSessions(address);
      
      await storage.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'REVOKE_ALL_SESSIONS',
        metadata: { revokedCount: count },
      });
      
      res.json({ success: true, revokedCount: count });
    } catch (error) {
      console.error('Error revoking sessions:', error);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  });

  // Enhanced audit logs with filters
  app.get('/api/admin/audit-logs/search', requirePermission('audit.read'), async (req, res) => {
    try {
      const { actor, target, action, limit } = req.query;
      
      const logs = await storage.getAuditLogs({
        actorAddress: actor as string | undefined,
        targetAddress: target as string | undefined,
        limit: parseInt(limit as string) || 100
      });
      
      // Filter by additional criteria
      let filtered = logs;
      if (action) {
        filtered = filtered.filter(l => l.actionType === action);
      }
      
      res.json(filtered);
    } catch (error) {
      console.error('Error searching audit logs:', error);
      res.status(500).json({ error: 'Failed to search audit logs' });
    }
  });

  // Admin login routes (username/password authentication)
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }
      
      const credentials = await storage.getAdminCredentialsByUsername(username);
      if (!credentials) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      // Check if account is locked
      if (credentials.lockedUntil && new Date(credentials.lockedUntil) > new Date()) {
        const minutesRemaining = Math.ceil((new Date(credentials.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ 
          error: 'Account locked',
          message: `Too many failed attempts. Try again in ${minutesRemaining} minutes.`
        });
      }
      
      // Verify the user still has admin role
      const identity = await storage.getIdentity(credentials.address);
      if (!identity || !['ultra_god_admin', 'founder', 'super_admin', 'admin', 'support'].includes(identity.role)) {
        return res.status(401).json({ error: 'Account no longer has admin privileges' });
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, credentials.passwordHash);
      if (!passwordValid) {
        // Increment failed attempts
        await storage.incrementFailedLoginAttempts(credentials.address);
        const updatedCreds = await storage.getAdminCredentialsByAddress(credentials.address);
        
        // Lock account if too many failed attempts
        if (updatedCreds && (updatedCreds.failedLoginAttempts ?? 0) >= MAX_FAILED_LOGIN_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          await storage.lockAdminAccount(credentials.address, lockUntil);
          
          await storage.createAuditLog({
            actorAddress: credentials.address,
            targetAddress: credentials.address,
            actionType: 'ADMIN_ACCOUNT_LOCKED',
            metadata: { reason: 'too_many_failed_attempts', lockedUntil: lockUntil.toISOString() }
          });
        }
        
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      // Reset failed attempts on successful login
      await storage.resetFailedLoginAttempts(credentials.address);
      
      // Create admin session
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
      const userAgent = req.headers['user-agent'] || '';
      const session = await storage.createAdminSession(credentials.address, ipAddress, userAgent);
      
      await storage.createAuditLog({
        actorAddress: credentials.address,
        targetAddress: credentials.address,
        actionType: 'ADMIN_LOGIN',
        metadata: { method: 'password', ipAddress, userAgent: userAgent.substring(0, 100) }
      });
      
      res.json({
        success: true,
        sessionToken: session.sessionToken,
        address: credentials.address,
        role: identity.role
      });
    } catch (error) {
      console.error('Error during admin login:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/admin/logout', async (req, res) => {
    try {
      const sessionToken = req.headers['x-admin-session'] as string;
      if (sessionToken) {
        await storage.revokeAdminSession(sessionToken);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error during admin logout:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/api/admin/session', async (req, res) => {
    try {
      const sessionToken = req.headers['x-admin-session'] as string;
      if (!sessionToken) {
        return res.status(401).json({ error: 'No session' });
      }
      
      const session = await storage.getAdminSession(sessionToken);
      if (!session || session.revokedAt) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      
      const identity = await storage.getIdentity(session.adminAddress);
      if (!identity || !['ultra_god_admin', 'founder', 'super_admin', 'admin', 'support'].includes(identity.role)) {
        return res.status(401).json({ error: 'Account no longer has admin privileges' });
      }
      
      res.json({
        valid: true,
        address: session.adminAddress,
        role: identity.role
      });
    } catch (error) {
      console.error('Error verifying admin session:', error);
      res.status(500).json({ error: 'Session verification failed' });
    }
  });

  // Admin credential setup - create username/password for an existing admin
  app.post('/api/admin/setup-credentials', async (req, res) => {
    try {
      const { address, publicKey, signature, timestamp, nonce, username, password } = req.body;
      
      if (!address || !publicKey || !signature || !timestamp || !nonce || !username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify signature
      const payload = { action: 'setup_admin_credentials', address, timestamp, nonce, username };
      const signatureValid = verifyGenericSignature(payload, signature, publicKey, nonce, timestamp);
      if (!signatureValid) {
        return res.status(401).json({ error: 'Invalid signature or expired timestamp' });
      }
      
      // Verify the user has admin role
      const identity = await storage.getIdentity(address);
      if (!identity || !['ultra_god_admin', 'founder', 'super_admin', 'admin', 'support'].includes(identity.role)) {
        return res.status(403).json({ error: 'Not an admin' });
      }
      
      // Check if credentials already exist
      const existingCreds = await storage.getAdminCredentialsByAddress(address);
      if (existingCreds) {
        return res.status(400).json({ error: 'Credentials already exist. Use change password instead.' });
      }
      
      // Check if username is taken
      const usernameExists = await storage.getAdminCredentialsByUsername(username);
      if (usernameExists) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      
      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      // Hash password and create credentials
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      await storage.createAdminCredentials({
        address,
        username,
        passwordHash
      });
      
      await storage.createAuditLog({
        actorAddress: address,
        targetAddress: address,
        actionType: 'ADMIN_CREDENTIALS_CREATED',
        metadata: { username }
      });
      
      res.json({ success: true, message: 'Admin credentials created' });
    } catch (error) {
      console.error('Error setting up admin credentials:', error);
      res.status(500).json({ error: 'Failed to create credentials' });
    }
  });

  // Check if admin has credentials set up
  app.get('/api/admin/credentials/:address', requirePermission('users.read'), async (req, res) => {
    try {
      const { address } = req.params;
      const credentials = await storage.getAdminCredentialsByAddress(address);
      if (credentials) {
        res.json({ hasCredentials: true, username: credentials.username });
      } else {
        res.status(404).json({ hasCredentials: false });
      }
    } catch (error) {
      console.error('Error checking admin credentials:', error);
      res.status(500).json({ error: 'Failed to check credentials' });
    }
  });

  // Change admin password
  app.post('/api/admin/change-password', async (req, res) => {
    try {
      const sessionToken = req.headers['x-admin-session'] as string;
      if (!sessionToken) {
        return res.status(401).json({ error: 'No session' });
      }
      
      const session = await storage.getAdminSession(sessionToken);
      if (!session || session.revokedAt) {
        return res.status(401).json({ error: 'Invalid session' });
      }
      
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }
      
      const credentials = await storage.getAdminCredentialsByAddress(session.adminAddress);
      if (!credentials) {
        return res.status(404).json({ error: 'Credentials not found' });
      }
      
      // Verify current password
      const currentValid = await bcrypt.compare(currentPassword, credentials.passwordHash);
      if (!currentValid) {
        return res.status(401).json({ error: 'Current password incorrect' });
      }
      
      // Hash and update new password
      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
      await storage.updateAdminCredentials(session.adminAddress, { passwordHash: newPasswordHash });
      
      await storage.createAuditLog({
        actorAddress: session.adminAddress,
        targetAddress: session.adminAddress,
        actionType: 'ADMIN_PASSWORD_CHANGED',
        metadata: {}
      });
      
      res.json({ success: true, message: 'Password changed' });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Bootstrap admin endpoint - one-time setup for first master admin
  app.post('/api/bootstrap-admin', async (req, res) => {
    try {
      const { address, publicKey, signature, timestamp, nonce, bootstrapSecret } = req.body;
      
      const envSecret = process.env.CV_BOOTSTRAP_SECRET;
      if (!envSecret) {
        return res.status(403).json({ error: 'Bootstrap not configured' });
      }
      
      if (bootstrapSecret !== envSecret) {
        return res.status(403).json({ error: 'Invalid bootstrap secret' });
      }
      
      // Check if bootstrap was already used (persisted in system settings)
      const bootstrapSetting = await storage.getSystemSetting('bootstrap_used');
      if (bootstrapSetting?.valueJson === 'true') {
        return res.status(403).json({ error: 'Bootstrap already used' });
      }
      
      // Check for existing admins with targeted query
      const identities = await storage.getAllIdentities();
      const hasAdmin = identities.some(i => 
        ['ultra_god_admin', 'founder', 'super_admin'].includes(i.role)
      );
      
      if (hasAdmin) {
        return res.status(403).json({ error: 'Admin already exists' });
      }
      
      if (!address || !publicKey || !signature || !timestamp || !nonce) {
        return res.status(400).json({ error: 'Missing required fields: address, publicKey, signature, timestamp, nonce' });
      }
      
      // Verify signature using the generic verification function
      const payload = { action: 'bootstrap_admin', address, timestamp, nonce };
      const signatureValid = verifyGenericSignature(payload, signature, publicKey, nonce, timestamp);
      if (!signatureValid) {
        return res.status(401).json({ error: 'Invalid signature or expired timestamp' });
      }
      
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found - register first' });
      }
      
      // Verify the public key matches the identity
      if (identity.publicKeyBase58 !== publicKey) {
        return res.status(401).json({ error: 'Public key mismatch' });
      }
      
      await storage.updateIdentity(address, { 
        role: 'ultra_god_admin',
        status: 'active'
      } as any);
      
      // Persist bootstrap usage to prevent replay after restart
      await storage.setSystemSetting('bootstrap_used', 'true', address);
      
      await storage.createAuditLog({
        actorAddress: address,
        targetAddress: address,
        actionType: 'BOOTSTRAP_ADMIN',
        metadata: { method: 'api' },
      });
      
      res.json({ success: true, message: 'Admin bootstrapped successfully' });
    } catch (error) {
      console.error('Error bootstrapping admin:', error);
      res.status(500).json({ error: 'Failed to bootstrap admin' });
    }
  });

  // Admin diagnostics endpoint
  app.get('/api/admin/diagnostics', requirePermission('system.settings'), async (_req, res) => {
    try {
      const diagnostics: any = {
        timestamp: new Date().toISOString(),
        checks: {}
      };
      
      // Database connectivity check
      try {
        const testQuery = await storage.getAllIdentities();
        diagnostics.checks.database = {
          status: 'ok',
          message: 'Database connected',
          userCount: testQuery.length
        };
      } catch (dbError) {
        diagnostics.checks.database = {
          status: 'error',
          message: 'Database connection failed',
          error: (dbError as Error).message
        };
      }
      
      // Stripe webhook status (check for recent webhook events)
      try {
        const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
        const webhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;
        diagnostics.checks.stripe = {
          status: stripeConfigured && webhookConfigured ? 'ok' : 'warning',
          message: stripeConfigured && webhookConfigured 
            ? 'Stripe configured' 
            : 'Stripe partially configured',
          details: {
            secretKeySet: stripeConfigured,
            webhookSecretSet: webhookConfigured,
            proPriceId: !!process.env.STRIPE_PRO_PRICE_ID,
            businessPriceId: !!process.env.STRIPE_BUSINESS_PRICE_ID
          }
        };
      } catch (stripeError) {
        diagnostics.checks.stripe = {
          status: 'error',
          message: 'Stripe check failed',
          error: (stripeError as Error).message
        };
      }
      
      // Free tier gating check
      diagnostics.checks.freeTierGating = {
        status: 'ok',
        message: 'Free tier enforcement active',
        limits: {
          maxCallsPerDay: FREE_TIER_LIMITS.MAX_CALLS_PER_DAY,
          maxMinutesPerMonth: FREE_TIER_LIMITS.MAX_SECONDS_PER_MONTH / 60,
          maxCallDurationMinutes: FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS / 60,
          heartbeatIntervalSeconds: FREE_TIER_LIMITS.HEARTBEAT_INTERVAL_SECONDS,
          heartbeatTimeoutSeconds: FREE_TIER_LIMITS.HEARTBEAT_TIMEOUT_SECONDS
        }
      };
      
      // RBAC status
      diagnostics.checks.rbac = {
        status: 'ok',
        message: 'RBAC system active',
        founderConfigured: !!(FOUNDER_PUBKEYS.length > 0 || FOUNDER_ADDRESS),
        founderType: FOUNDER_PUBKEYS.length > 0 ? 'pubkey' : (FOUNDER_ADDRESS ? 'address' : 'none')
      };
      
      // Recent security events
      try {
        const recentLogs = await storage.getAuditLogs({ limit: 20 });
        const securityEvents = recentLogs.filter(l => 
          ['SUSPEND_USER', 'ROLE_CHANGE', 'BOOTSTRAP_ADMIN', 'LOGIN_FAILED', 'SESSION_REVOKED'].includes(l.actionType)
        );
        diagnostics.checks.securityEvents = {
          status: 'ok',
          recentCount: securityEvents.length,
          events: securityEvents.slice(0, 10).map(e => ({
            action: e.actionType,
            actor: e.actorAddress?.slice(0, 20) + '...',
            target: e.targetAddress?.slice(0, 20) + '...',
            time: e.createdAt
          }))
        };
      } catch (logError) {
        diagnostics.checks.securityEvents = {
          status: 'warning',
          message: 'Could not fetch security events'
        };
      }
      
      // Active calls check
      try {
        const activeCalls = await storage.getAllActiveCalls();
        diagnostics.checks.activeCalls = {
          status: 'ok',
          count: activeCalls.length
        };
      } catch (callError) {
        diagnostics.checks.activeCalls = {
          status: 'warning',
          message: 'Could not fetch active calls'
        };
      }
      
      // Call token health (last 24 hours)
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tokenMetrics = await storage.getTokenMetrics(oneDayAgo);
        
        const mintedCount = tokenMetrics.find(m => m.eventType === 'minted')?.count || 0;
        const verifyOkCount = tokenMetrics.find(m => m.eventType === 'verify_ok')?.count || 0;
        const verifyExpiredCount = tokenMetrics.find(m => m.eventType === 'verify_expired')?.count || 0;
        const verifyReplayCount = tokenMetrics.find(m => m.eventType === 'verify_replay')?.count || 0;
        const verifyInvalidCount = tokenMetrics.find(m => m.eventType === 'verify_invalid')?.count || 0;
        
        const totalFailures = verifyExpiredCount + verifyReplayCount + verifyInvalidCount;
        const failureRate = mintedCount > 0 ? (totalFailures / mintedCount * 100).toFixed(2) : '0';
        
        diagnostics.checks.callTokenHealth = {
          status: totalFailures > 10 ? 'warning' : 'ok',
          message: `${failureRate}% token failure rate (24h)`,
          last24Hours: {
            minted: mintedCount,
            verified: verifyOkCount,
            expired: verifyExpiredCount,
            replay: verifyReplayCount,
            invalid: verifyInvalidCount,
            failureRate: parseFloat(failureRate)
          }
        };
      } catch (tokenError) {
        diagnostics.checks.callTokenHealth = {
          status: 'warning',
          message: 'Could not fetch token metrics'
        };
      }
      
      // Overall status
      const hasErrors = Object.values(diagnostics.checks).some((c: any) => c.status === 'error');
      const hasWarnings = Object.values(diagnostics.checks).some((c: any) => c.status === 'warning');
      diagnostics.overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';
      
      res.json(diagnostics);
    } catch (error) {
      console.error('Error running diagnostics:', error);
      res.status(500).json({ error: 'Failed to run diagnostics' });
    }
  });

  // Admin token logs endpoint - detailed failure logs for debugging
  app.get('/api/admin/token-logs', requirePermission('audit.read'), async (req, res) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      const logs = await storage.getTokenLogs(since, limit);
      
      // Group by eventType for summary
      const summary: Record<string, number> = {};
      logs.forEach(log => {
        summary[log.eventType] = (summary[log.eventType] || 0) + 1;
      });
      
      res.json({
        timeRange: {
          from: since.toISOString(),
          to: new Date().toISOString(),
          hoursBack
        },
        summary,
        logs: logs.map(log => ({
          id: log.id,
          eventType: log.eventType,
          userAddress: log.userAddress ? `${log.userAddress.slice(0, 20)}...` : null,
          ipAddress: log.ipAddress,
          details: log.details,
          createdAt: log.createdAt
        }))
      });
    } catch (error) {
      console.error('Error fetching token logs:', error);
      res.status(500).json({ error: 'Failed to fetch token logs' });
    }
  });

  // Admin push subscription management endpoints
  app.get('/api/admin/push-stats', requirePermission('audit.read'), async (_req, res) => {
    try {
      const stats = await storage.getPushSubscriptionStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching push stats:', error);
      res.status(500).json({ error: 'Failed to fetch push stats' });
    }
  });

  app.get('/api/admin/push-subscriptions', requirePermission('audit.read'), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const subscriptions = await storage.getAllPushSubscriptionsWithUsers(limit);
      res.json({ subscriptions });
    } catch (error) {
      console.error('Error fetching push subscriptions:', error);
      res.status(500).json({ error: 'Failed to fetch push subscriptions' });
    }
  });

  app.delete('/api/admin/push-subscriptions/:address', requirePermission('users.manage'), async (req, res) => {
    try {
      const { address } = req.params;
      const deletedCount = await storage.deleteAllPushSubscriptions(address);
      console.log(`Admin revoked ${deletedCount} push subscriptions for ${address}`);
      res.json({ success: true, deletedCount });
    } catch (error) {
      console.error('Error revoking push subscriptions:', error);
      res.status(500).json({ error: 'Failed to revoke push subscriptions' });
    }
  });

  // Get user's free tier remaining limits
  app.get('/api/free-tier/limits/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const limits = await FreeTierShield.getRemainingLimits(address);
      res.json({
        ...limits,
        config: {
          maxCallsPerDay: FREE_TIER_LIMITS.MAX_CALLS_PER_DAY,
          maxMinutesPerMonth: FREE_TIER_LIMITS.MAX_SECONDS_PER_MONTH / 60,
          maxCallDurationMinutes: FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS / 60,
          maxAttemptsPerHour: FREE_TIER_LIMITS.MAX_CALL_ATTEMPTS_PER_HOUR,
        }
      });
    } catch (error) {
      console.error('Error fetching free tier limits:', error);
      res.status(500).json({ error: 'Failed to fetch limits' });
    }
  });

  // Call heartbeat endpoint (D)
  app.post('/api/call/heartbeat', async (req, res) => {
    try {
      const { callSessionId, userAddress, isRelay } = req.body;
      
      if (!callSessionId || !userAddress) {
        return res.status(400).json({ error: 'Missing callSessionId or userAddress' });
      }
      
      // Rate limit heartbeats
      if (!FreeTierShield.checkRateLimit(`heartbeat:${userAddress}`, FreeTierShield.RATE_LIMITS.HEARTBEAT)) {
        return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many heartbeat requests' });
      }
      
      const result = await FreeTierShield.updateHeartbeat(callSessionId, userAddress, isRelay);
      
      if (result.shouldTerminate) {
        return res.json({
          shouldTerminate: true,
          reason: result.reason,
          remainingSeconds: 0
        });
      }
      
      res.json({
        shouldTerminate: false,
        remainingSeconds: result.remainingSeconds
      });
    } catch (error) {
      console.error('Error processing heartbeat:', error);
      res.status(500).json({ error: 'Failed to process heartbeat' });
    }
  });

  // Check if call can be started (pre-flight check)
  app.post('/api/call/can-start', async (req, res) => {
    try {
      const { callerAddress, calleeAddress, isGroupCall, isExternalLink, isPaidCall } = req.body;
      
      if (!callerAddress || !calleeAddress) {
        return res.status(400).json({ error: 'Missing callerAddress or calleeAddress' });
      }
      
      // Rate limit call start checks
      if (!FreeTierShield.checkRateLimit(`call_start:${callerAddress}`, FreeTierShield.RATE_LIMITS.CALL_START)) {
        return res.status(429).json({ 
          allowed: false, 
          errorCode: 'RATE_LIMITED' as ShieldErrorCode, 
          message: 'Too many call attempts. Please wait.' 
        });
      }
      
      // Look up contacts SERVER-SIDE to determine relationship (client can't know if callee added them)
      const callerContact = await storage.getContact(callerAddress, calleeAddress);
      const calleeContact = await storage.getContact(calleeAddress, callerAddress);
      const isMutualContact = !!(callerContact && calleeContact);
      const isEitherContact = !!(callerContact || calleeContact); // EITHER party added the other
      const isContact = !!callerContact;
      
      const result = await FreeTierShield.canStartCall(callerAddress, calleeAddress, {
        isContact,
        isMutualContact,
        isEitherContact,
        isGroupCall,
        isExternalLink,
        isPaidCall
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error checking call permission:', error);
      res.status(500).json({ error: 'Failed to check call permission' });
    }
  });

  // Record call end and update usage
  app.post('/api/call/end', async (req, res) => {
    try {
      const { callSessionId, durationSeconds } = req.body;
      
      if (!callSessionId || durationSeconds === undefined) {
        return res.status(400).json({ error: 'Missing callSessionId or durationSeconds' });
      }
      
      await FreeTierShield.recordCallEnd(callSessionId, durationSeconds);
      res.json({ success: true });
    } catch (error) {
      console.error('Error recording call end:', error);
      res.status(500).json({ error: 'Failed to record call end' });
    }
  });

  // Public endpoint to check trial access (for paywall bypass)
  app.get('/api/trial/check/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const access = await storage.checkTrialAccess(address);
      res.json(access);
    } catch (error) {
      console.error('Error checking trial access:', error);
      res.status(500).json({ error: 'Failed to check trial access' });
    }
  });

  // Consume trial minutes for a call (authenticated with replay protection)
  app.post('/api/trial/consume', async (req, res) => {
    try {
      const { address, minutes, signature, timestamp, nonce } = req.body;
      
      if (!address || !minutes) {
        return res.status(400).json({ error: 'Missing address or minutes' });
      }
      
      // Require authentication to prevent abuse
      if (!signature || !timestamp || !nonce) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check timestamp freshness (60 second window)
      if (Math.abs(Date.now() - timestamp) > 60 * 1000) {
        return res.status(401).json({ error: 'Request expired' });
      }
      
      // Check for nonce replay (database-persisted per-address tracking)
      const nonceUsed = await storage.isTrialNonceUsed(address, nonce);
      if (nonceUsed) {
        return res.status(401).json({ error: 'Nonce already used' });
      }
      
      // Get identity to verify signature
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found' });
      }
      
      // Verify signature - only the holder of the secret key can sign this message
      try {
        const message = `trial:${address}:${minutes}:${timestamp}:${nonce}`;
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(identity.publicKeyBase58);
        
        const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } catch (error) {
        return res.status(401).json({ error: 'Signature verification failed' });
      }
      
      // Atomically mark nonce as used in database (after successful signature verification)
      // Returns false if nonce was already used (race condition with unique constraint)
      const nonceMarked = await storage.markTrialNonceUsed(address, nonce);
      if (!nonceMarked) {
        return res.status(401).json({ error: 'Nonce already used' });
      }
      
      // Check if trial is still valid
      const access = await storage.checkTrialAccess(address);
      if (!access.hasAccess) {
        return res.status(403).json({ error: access.reason || 'No trial access' });
      }
      
      // Consume the minutes
      const updated = await storage.consumeTrialMinutes(address, minutes);
      if (!updated) {
        return res.status(404).json({ error: 'Failed to consume trial minutes' });
      }
      
      res.json({ 
        success: true, 
        remainingMinutes: updated.trialMinutesRemaining,
        trialStatus: updated.trialStatus
      });
    } catch (error) {
      console.error('Error consuming trial:', error);
      res.status(500).json({ error: 'Failed to consume trial minutes' });
    }
  });

  // Public endpoint to get user role (for admin UI access check)
  app.get('/api/identity/:address/role', async (req, res) => {
    try {
      const { address } = req.params;
      const identity = await storage.getIdentity(address);
      
      if (!identity) {
        return res.json({ role: 'user', isAdmin: false, isFounder: false });
      }
      
      res.json({ 
        role: identity.role,
        isAdmin: identity.role === 'admin' || identity.role === 'founder',
        isFounder: identity.role === 'founder',
        isDisabled: identity.isDisabled
      });
    } catch (error) {
      console.error('Error fetching identity role:', error);
      res.status(500).json({ error: 'Failed to fetch identity role' });
    }
  });

  // Auto-promote founder on identity creation/registration
  app.post('/api/identity/register', async (req, res) => {
    try {
      const { address, publicKeyBase58, displayName } = req.body;
      
      // Check if identity already exists
      let identity = await storage.getIdentity(address);
      
      if (identity) {
        // Update last login
        await storage.updateIdentity(address, { lastLoginAt: new Date() } as any);
        
        // ALWAYS check founder status on every login (for cross-browser sync)
        if (isFounderAddress(address) && identity.role !== 'founder') {
          identity = await storage.updateIdentity(address, { role: 'founder' } as any) || identity;
          console.log(`Existing user ${address} promoted to founder role on login`);
        }
        
        // Refetch to get updated identity
        identity = await storage.getIdentity(address) || identity;
        return res.json(identity);
      }
      
      // Create new identity
      identity = await storage.createIdentity({
        address,
        publicKeyBase58,
        displayName,
      });
      
      // Check if this is the founder (by pubkey or full address)
      if (isFounderAddress(address)) {
        identity = await storage.updateIdentity(address, { role: 'founder' } as any) || identity;
        console.log(`New user ${address} promoted to founder role`);
      }
      
      res.json(identity);
    } catch (error) {
      console.error('Error registering identity:', error);
      res.status(500).json({ error: 'Failed to register identity' });
    }
  });

  // IDENTITY VAULT ENDPOINTS (Cross-browser sync)
  
  // Store encrypted identity in vault (requires signature verification)
  app.post('/api/identity/vault', async (req, res) => {
    try {
      const { publicKeyBase58, encryptedKeypair, salt, hint, signature, nonce, timestamp } = req.body;
      const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      if (!publicKeyBase58 || !encryptedKeypair || !salt) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      if (!signature || !nonce || !timestamp) {
        return res.status(400).json({ error: 'Missing authentication fields (signature, nonce, timestamp)' });
      }
      
      // Verify signature to prove ownership of the keypair
      const payload = { publicKeyBase58, encryptedKeypair, salt, hint, nonce, timestamp };
      const isValid = verifyGenericSignature(payload, signature, publicKeyBase58, nonce, timestamp);
      
      if (!isValid) {
        // Log failed signature attempt
        await storage.logVaultAccess({
          publicKeyBase58,
          ipAddress,
          userAgent,
          accessType: 'create_failed_signature',
          success: false,
        });
        return res.status(401).json({ error: 'Invalid signature - cannot verify ownership of this identity' });
      }
      
      // Check if vault already exists
      const existing = await storage.getIdentityVault(publicKeyBase58);
      if (existing) {
        // Update existing vault
        const updated = await storage.updateIdentityVault(publicKeyBase58, {
          encryptedKeypair,
          salt,
          hint,
        });
        
        // Log vault update
        await storage.logVaultAccess({
          publicKeyBase58,
          ipAddress,
          userAgent,
          accessType: 'update',
          success: true,
        });
        
        return res.json({ success: true, updated: true });
      }
      
      // Create new vault
      await storage.createIdentityVault({
        publicKeyBase58,
        encryptedKeypair,
        salt,
        hint,
      });
      
      // Log vault creation
      await storage.logVaultAccess({
        publicKeyBase58,
        ipAddress,
        userAgent,
        accessType: 'create',
        success: true,
      });
      
      res.json({ success: true, created: true });
    } catch (error) {
      console.error('Error storing identity vault:', error);
      res.status(500).json({ error: 'Failed to store identity vault' });
    }
  });
  
  // Retrieve encrypted identity from vault (with rate limiting and IP logging)
  app.get('/api/identity/vault/:publicKeyBase58', async (req, res) => {
    try {
      const { publicKeyBase58 } = req.params;
      const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Rate limiting: max 10 vault fetch attempts per hour per IP
      const recentIpAttempts = await storage.getVaultAccessesByIp(ipAddress, 60);
      if (recentIpAttempts.length >= 10) {
        console.warn(`Rate limit exceeded for vault access from IP ${ipAddress}`);
        await storage.logVaultAccess({
          publicKeyBase58,
          ipAddress,
          userAgent,
          accessType: 'rate_limited',
          success: false,
        });
        return res.status(429).json({ 
          error: 'Too many vault access attempts. Please try again later.',
          retryAfter: 3600 
        });
      }
      
      // Rate limiting: max 5 vault fetch attempts per hour per public key
      const recentKeyAttempts = await storage.getRecentVaultAccessAttempts(publicKeyBase58, 60);
      if (recentKeyAttempts.length >= 5) {
        console.warn(`Rate limit exceeded for vault access to key ${publicKeyBase58.substring(0, 10)}...`);
        await storage.logVaultAccess({
          publicKeyBase58,
          ipAddress,
          userAgent,
          accessType: 'rate_limited',
          success: false,
        });
        return res.status(429).json({ 
          error: 'Too many access attempts for this identity. Please try again later.',
          retryAfter: 3600 
        });
      }
      
      const vault = await storage.getIdentityVault(publicKeyBase58);
      if (!vault) {
        // Log failed attempt
        await storage.logVaultAccess({
          publicKeyBase58,
          ipAddress,
          userAgent,
          accessType: 'fetch',
          success: false,
        });
        return res.status(404).json({ error: 'Vault not found' });
      }
      
      // Log successful access
      await storage.logVaultAccess({
        publicKeyBase58,
        ipAddress,
        userAgent,
        accessType: 'fetch',
        success: true,
      });
      
      res.json({
        encryptedKeypair: vault.encryptedKeypair,
        salt: vault.salt,
        hint: vault.hint,
      });
    } catch (error) {
      console.error('Error fetching identity vault:', error);
      res.status(500).json({ error: 'Failed to fetch identity vault' });
    }
  });
  
  // Check if vault exists for a public key
  app.get('/api/identity/vault-exists/:publicKeyBase58', async (req, res) => {
    try {
      const { publicKeyBase58 } = req.params;
      const vault = await storage.getIdentityVault(publicKeyBase58);
      res.json({ exists: !!vault, hint: vault?.hint });
    } catch (error) {
      console.error('Error checking vault existence:', error);
      res.status(500).json({ error: 'Failed to check vault' });
    }
  });

  // LINKED ADDRESSES ENDPOINTS (Multiple numbers under one account)
  
  // Get all Call IDs (primary + linked addresses) for a user
  app.get('/api/linked-addresses/:primaryAddress', async (req, res) => {
    try {
      const { primaryAddress } = req.params;
      const links = await storage.getLinkedAddresses(primaryAddress);
      
      // Get entitlements to show limits
      const { getEffectiveEntitlements } = await import('./entitlements');
      const entitlements = await getEffectiveEntitlements(primaryAddress);
      
      res.json({
        callIds: [
          { address: primaryAddress, label: 'Primary', isPrimary: true },
          ...links.map(l => ({ address: l.linkedAddress, label: l.label || 'Secondary', isPrimary: false, id: l.id }))
        ],
        currentCount: 1 + links.length,
        maxAllowed: entitlements.maxCallIds,
        canAddMore: (1 + links.length) < entitlements.maxCallIds
      });
    } catch (error) {
      console.error('Error fetching linked addresses:', error);
      res.status(500).json({ error: 'Failed to fetch linked addresses' });
    }
  });
  
  // Update linked address label
  app.patch('/api/linked-addresses/:linkedAddress', async (req, res) => {
    try {
      const { linkedAddress } = req.params;
      const { label, primaryAddress, signature, timestamp, nonce } = req.body;
      
      // Verify ownership - must be signed by primary
      const primaryIdentity = await storage.getIdentity(primaryAddress);
      if (!primaryIdentity) {
        return res.status(404).json({ error: 'Primary identity not found' });
      }
      
      const payload = { linkedAddress, label, primaryAddress, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, primaryIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Verify the linked address belongs to this primary
      const actualPrimary = await storage.getPrimaryAddress(linkedAddress);
      if (actualPrimary !== primaryAddress) {
        return res.status(403).json({ error: 'This address is not linked to your account' });
      }
      
      const updated = await storage.updateLinkedAddressLabel(linkedAddress, label);
      res.json(updated);
    } catch (error) {
      console.error('Error updating linked address:', error);
      res.status(500).json({ error: 'Failed to update linked address' });
    }
  });

  // Link a new address to a primary
  app.post('/api/linked-addresses', async (req, res) => {
    try {
      const { primaryAddress, linkedAddress, linkedPublicKey, label, signature, timestamp, nonce } = req.body;
      
      if (!primaryAddress || !linkedAddress || !linkedPublicKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify the primary owns the address by checking signature
      const primaryIdentity = await storage.getIdentity(primaryAddress);
      if (!primaryIdentity) {
        return res.status(404).json({ error: 'Primary identity not found' });
      }
      
      // Check entitlement limit for Call IDs
      const { getEffectiveEntitlements } = await import('./entitlements');
      const entitlements = await getEffectiveEntitlements(primaryAddress);
      const existingLinks = await storage.getLinkedAddresses(primaryAddress);
      const currentCallIds = 1 + existingLinks.length; // Primary + linked addresses
      
      if (currentCallIds >= entitlements.maxCallIds) {
        return res.status(403).json({ 
          error: 'Call ID limit reached',
          message: `Your plan allows ${entitlements.maxCallIds} Call ID(s). Upgrade to add more.`,
          currentCount: currentCallIds,
          maxAllowed: entitlements.maxCallIds
        });
      }
      
      // Verify signature from primary address
      const payload = { primaryAddress, linkedAddress, linkedPublicKey, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, primaryIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Check if linked address is already linked
      const isAlreadyLinked = await storage.isAddressLinked(linkedAddress);
      if (isAlreadyLinked) {
        return res.status(400).json({ error: 'Address is already linked to another account' });
      }
      
      // Check if the linked address pubkey matches
      const extractedPubkey = extractPubkeyFromAddress(linkedAddress);
      if (extractedPubkey !== linkedPublicKey) {
        return res.status(400).json({ error: 'Public key does not match linked address' });
      }
      
      const link = await storage.linkAddress(primaryAddress, linkedAddress, linkedPublicKey, label);
      
      // If primary is founder, the linked address inherits founder tier automatically via getUserTier
      console.log(`Address ${linkedAddress} linked to ${primaryAddress}`);
      
      res.json(link);
    } catch (error) {
      console.error('Error linking address:', error);
      res.status(500).json({ error: 'Failed to link address' });
    }
  });

  // Unlink an address
  app.delete('/api/linked-addresses/:linkedAddress', async (req, res) => {
    try {
      const { linkedAddress } = req.params;
      const { primaryAddress, signature, timestamp, nonce } = req.body;
      
      // Verify ownership - must be signed by primary
      const primaryIdentity = await storage.getIdentity(primaryAddress);
      if (!primaryIdentity) {
        return res.status(404).json({ error: 'Primary identity not found' });
      }
      
      const payload = { linkedAddress, primaryAddress, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, primaryIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Verify the linked address belongs to this primary
      const actualPrimary = await storage.getPrimaryAddress(linkedAddress);
      if (actualPrimary !== primaryAddress) {
        return res.status(403).json({ error: 'This address is not linked to your account' });
      }
      
      const success = await storage.unlinkAddress(linkedAddress);
      res.json({ success });
    } catch (error) {
      console.error('Error unlinking address:', error);
      res.status(500).json({ error: 'Failed to unlink address' });
    }
  });

  // CALL ID SETTINGS ENDPOINTS (DND, Call Waiting per-line)
  
  // Get settings for a specific Call ID (requires signed request)
  app.post('/api/call-id-settings/:callIdAddress/get', async (req, res) => {
    try {
      const { callIdAddress } = req.params;
      const { ownerAddress, signature, timestamp, nonce } = req.body;
      
      // Verify signature from owner
      const ownerIdentity = await storage.getIdentity(ownerAddress);
      if (!ownerIdentity) {
        return res.status(404).json({ error: 'Owner identity not found' });
      }
      
      const payload = { callIdAddress, ownerAddress, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, ownerIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Verify ownership - callIdAddress must be owned by ownerAddress
      if (callIdAddress !== ownerAddress) {
        const actualPrimary = await storage.getPrimaryAddress(callIdAddress);
        if (actualPrimary !== ownerAddress) {
          return res.status(403).json({ error: 'You do not own this Call ID' });
        }
      }
      
      // Ensure settings exist and return them
      const settings = await storage.ensureCallIdSettings(callIdAddress, ownerAddress);
      res.json(settings);
    } catch (error) {
      console.error('Error getting call ID settings:', error);
      res.status(500).json({ error: 'Failed to get call ID settings' });
    }
  });
  
  // Get all Call ID settings for a user (requires signed request)
  app.post('/api/call-id-settings/user/:ownerAddress/get', async (req, res) => {
    try {
      const { ownerAddress } = req.params;
      const { signature, timestamp, nonce } = req.body;
      
      // Verify signature from owner
      const ownerIdentity = await storage.getIdentity(ownerAddress);
      if (!ownerIdentity) {
        return res.status(404).json({ error: 'Owner identity not found' });
      }
      
      const payload = { ownerAddress, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, ownerIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const allSettings = await storage.getAllCallIdSettings(ownerAddress);
      res.json(allSettings);
    } catch (error) {
      console.error('Error getting all call ID settings:', error);
      res.status(500).json({ error: 'Failed to get call ID settings' });
    }
  });
  
  // Create or update Call ID settings
  app.put('/api/call-id-settings/:callIdAddress', async (req, res) => {
    try {
      const { callIdAddress } = req.params;
      const { ownerAddress, signature, timestamp, nonce, ...updates } = req.body;
      
      // Verify signature from owner
      const ownerIdentity = await storage.getIdentity(ownerAddress);
      if (!ownerIdentity) {
        return res.status(404).json({ error: 'Owner identity not found' });
      }
      
      const payload = { callIdAddress, ownerAddress, timestamp, nonce, ...updates };
      const isValid = verifyGenericSignature(payload, signature, ownerIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Verify ownership - callIdAddress must be owned by ownerAddress
      // Either it's the primary address itself, or it's a linked address
      if (callIdAddress !== ownerAddress) {
        const actualPrimary = await storage.getPrimaryAddress(callIdAddress);
        if (actualPrimary !== ownerAddress) {
          return res.status(403).json({ error: 'You do not own this Call ID' });
        }
      }
      
      // Ensure settings exist, then update
      await storage.ensureCallIdSettings(callIdAddress, ownerAddress);
      const updated = await storage.updateCallIdSettings(callIdAddress, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating call ID settings:', error);
      res.status(500).json({ error: 'Failed to update call ID settings' });
    }
  });
  
  // Quick toggle DND for a Call ID
  app.post('/api/call-id-settings/:callIdAddress/dnd', async (req, res) => {
    try {
      const { callIdAddress } = req.params;
      const { ownerAddress, enabled, signature, timestamp, nonce } = req.body;
      
      // Verify signature from owner
      const ownerIdentity = await storage.getIdentity(ownerAddress);
      if (!ownerIdentity) {
        return res.status(404).json({ error: 'Owner identity not found' });
      }
      
      const payload = { callIdAddress, ownerAddress, enabled, timestamp, nonce };
      const isValid = verifyGenericSignature(payload, signature, ownerIdentity.publicKeyBase58, nonce, timestamp);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Verify ownership
      if (callIdAddress !== ownerAddress) {
        const actualPrimary = await storage.getPrimaryAddress(callIdAddress);
        if (actualPrimary !== ownerAddress) {
          return res.status(403).json({ error: 'You do not own this Call ID' });
        }
      }
      
      await storage.ensureCallIdSettings(callIdAddress, ownerAddress);
      const updated = await storage.updateCallIdSettings(callIdAddress, { doNotDisturb: enabled });
      res.json(updated);
    } catch (error) {
      console.error('Error toggling DND:', error);
      res.status(500).json({ error: 'Failed to toggle DND' });
    }
  });

  // Simple DND endpoints (same trust model as freeze-mode)
  
  // Get DND status for an address (works for primary or linked addresses)
  app.get('/api/dnd/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      // Find owner address - either it's a primary identity or a linked address
      let ownerAddress = address;
      const directIdentity = await storage.getIdentity(address);
      
      if (!directIdentity) {
        // Check if it's a linked address
        const primaryAddress = await storage.getPrimaryAddress(address);
        if (!primaryAddress) {
          // Not found as direct identity or linked address - allow anyway for flexibility
          res.json({ doNotDisturb: false });
          return;
        }
        ownerAddress = primaryAddress;
      }
      
      // Try to get existing settings for this specific call ID
      const settings = await storage.getCallIdSettings(address);
      res.json({ doNotDisturb: settings?.doNotDisturb || false });
    } catch (error) {
      console.error('Error fetching DND status:', error);
      res.status(500).json({ error: 'Failed to fetch DND status' });
    }
  });

  
  // PUSH NOTIFICATION ENDPOINTS
  
  // Get VAPID public key for push subscription
  app.get('/api/push/vapid-public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: 'Push notifications not configured' });
    }
    res.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
  });

  // Subscribe to push notifications
  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const { userAddress, subscription } = req.body;
      
      if (!userAddress || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Missing required subscription data' });
      }
      
      await storage.savePushSubscription(
        userAddress,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth
      );
      
      console.log(`Push subscription saved for ${userAddress}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      res.status(500).json({ error: 'Failed to save push subscription' });
    }
  });

  // Unsubscribe from push notifications
  app.post('/api/push/unsubscribe', async (req, res) => {
    try {
      const { userAddress, endpoint } = req.body;
      
      if (!userAddress || !endpoint) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      await storage.deletePushSubscription(userAddress, endpoint);
      console.log(`Push subscription removed for ${userAddress}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing push subscription:', error);
      res.status(500).json({ error: 'Failed to remove push subscription' });
    }
  });

  // Native device push token registration (FCM/APNs)
  app.post('/api/push/native/register', async (req, res) => {
    try {
      const { userAddress, platform, token, deviceInfo, appVersion, signature, timestamp, nonce } = req.body;
      
      if (!userAddress || !platform || !token || !signature || !timestamp || !nonce) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify timestamp is recent (within 2 minutes)
      const now = Date.now();
      const requestTime = parseInt(timestamp, 10);
      if (isNaN(requestTime) || Math.abs(now - requestTime) > 2 * 60 * 1000) {
        return res.status(400).json({ error: 'Request expired. Please try again.' });
      }
      
      // Verify signature using Ed25519
      const message = `push-register:${userAddress}:${platform}:${token}:${timestamp}:${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      
      try {
        const parts = userAddress.split(':');
        if (parts.length !== 3 || parts[0] !== 'call') {
          return res.status(400).json({ error: 'Invalid address format' });
        }
        const publicKey = bs58.decode(parts[1]);
        const signatureBytes = bs58.decode(signature);
        
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
        if (!isValid) {
          return res.status(403).json({ error: 'Invalid signature' });
        }
      } catch (sigError) {
        console.error('Signature verification error:', sigError);
        return res.status(403).json({ error: 'Signature verification failed' });
      }
      
      await storage.saveDevicePushToken(userAddress, platform, token, deviceInfo, appVersion);
      console.log(`Native push token registered for ${userAddress} (${platform})`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error registering native push token:', error);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  });

  app.post('/api/push/native/unregister', async (req, res) => {
    try {
      const { userAddress, token, signature, timestamp, nonce } = req.body;
      
      if (!userAddress || !token || !signature || !timestamp || !nonce) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify timestamp is recent
      const now = Date.now();
      const requestTime = parseInt(timestamp, 10);
      if (isNaN(requestTime) || Math.abs(now - requestTime) > 2 * 60 * 1000) {
        return res.status(400).json({ error: 'Request expired' });
      }
      
      // Verify signature
      const message = `push-unregister:${userAddress}:${token}:${timestamp}:${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      
      try {
        const parts = userAddress.split(':');
        if (parts.length !== 3 || parts[0] !== 'call') {
          return res.status(400).json({ error: 'Invalid address format' });
        }
        const publicKey = bs58.decode(parts[1]);
        const signatureBytes = bs58.decode(signature);
        
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
        if (!isValid) {
          return res.status(403).json({ error: 'Invalid signature' });
        }
      } catch (sigError) {
        return res.status(403).json({ error: 'Signature verification failed' });
      }
      
      await storage.deleteDevicePushToken(userAddress, token);
      console.log(`Native push token unregistered for ${userAddress}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error unregistering native push token:', error);
      res.status(500).json({ error: 'Failed to unregister push token' });
    }
  });

  // Send test push notification to the authenticated user (signature verified)
  app.post('/api/push/test', async (req, res) => {
    try {
      const { userAddress, signature, timestamp, nonce } = req.body;
      
      if (!userAddress || !signature || !timestamp || !nonce) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Verify timestamp is recent (within 2 minutes)
      const now = Date.now();
      const requestTime = parseInt(timestamp, 10);
      if (isNaN(requestTime) || Math.abs(now - requestTime) > 2 * 60 * 1000) {
        return res.status(400).json({ error: 'Request expired. Please try again.' });
      }
      
      // Verify signature using Ed25519
      const message = `push-test:${userAddress}:${timestamp}:${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      
      try {
        // Extract public key from address (format: call:<base58pubkey>:<suffix>)
        const parts = userAddress.split(':');
        if (parts.length !== 3 || parts[0] !== 'call') {
          return res.status(400).json({ error: 'Invalid address format' });
        }
        const publicKey = bs58.decode(parts[1]);
        const signatureBytes = bs58.decode(signature);
        
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
        if (!isValid) {
          return res.status(403).json({ error: 'Invalid signature' });
        }
      } catch (sigError) {
        console.error('Signature verification error:', sigError);
        return res.status(403).json({ error: 'Signature verification failed' });
      }
      
      // Rate limit: max 3 test notifications per minute
      const rateKey = `push_test:${userAddress}`;
      const existing = rateLimitMap.get(rateKey);
      if (existing && now < existing.resetTime && existing.count >= 3) {
        return res.status(429).json({ error: 'Too many test notifications. Please wait a minute.' });
      }
      if (!existing || now >= existing.resetTime) {
        rateLimitMap.set(rateKey, { count: 1, resetTime: now + 60000 });
      } else {
        existing.count++;
      }
      
      const sent = await sendPushNotification(userAddress, {
        type: 'test',
        title: 'Test Notification',
        body: 'Push notifications are working! You will receive alerts for incoming calls.',
        tag: 'test-notification'
      });
      
      if (sent) {
        res.json({ success: true, message: 'Test notification sent' });
      } else {
        res.json({ success: false, message: 'No push subscriptions found or push not configured' });
      }
    } catch (error) {
      console.error('Error sending test push:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  });

  // Get push subscription status for a user
  app.get('/api/push/status/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const subscriptions = await storage.getPushSubscriptions(address);
      res.json({
        enabled: subscriptions.length > 0,
        subscriptionCount: subscriptions.length,
        vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
      });
    } catch (error) {
      console.error('Error getting push status:', error);
      res.status(500).json({ error: 'Failed to get push status' });
    }
  });

  // Get user entitlements (public) - Legacy endpoint
  app.get('/api/entitlements/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const identity = await storage.getIdentity(address);
      
      if (!identity) {
        return res.json({ 
          canUseProFeatures: false, 
          canUseBusinessFeatures: false,
          plan: 'free',
          trialStatus: 'none'
        });
      }
      
      const canUsePro = await storage.canUseProFeatures(address);
      const canUseBusiness = await storage.canUseBusinessFeatures(address);
      
      res.json({
        canUseProFeatures: canUsePro,
        canUseBusinessFeatures: canUseBusiness,
        plan: identity.plan,
        planStatus: identity.planStatus,
        trialStatus: identity.trialStatus,
        trialEndAt: identity.trialEndAt,
        trialMinutesRemaining: identity.trialMinutesRemaining,
        trialPlan: identity.trialPlan,
      });
    } catch (error) {
      console.error('Error fetching entitlements:', error);
      res.status(500).json({ error: 'Failed to fetch entitlements' });
    }
  });

  // USER MODE ENDPOINTS (Phase 5)
  
  // Get user mode and available modes
  app.get('/api/mode/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const identity = await storage.getIdentity(address);
      
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const modeSettings = await storage.ensureUserModeSettings(address);
      const { getAvailableModesForPlan } = await import('./entitlements');
      
      // Founders, admins, and comped users get all modes
      const hasFullAccess = identity.role === 'founder' || identity.role === 'admin' || identity.isComped === true;
      const allModes: Array<'personal' | 'creator' | 'business' | 'stage'> = ['personal', 'creator', 'business', 'stage'];
      const availableModes = hasFullAccess ? allModes : getAvailableModesForPlan(identity.plan);
      
      res.json({
        mode: modeSettings.mode,
        flags: modeSettings.flags,
        availableModes,
        plan: hasFullAccess ? 'founder' : identity.plan,
        isFounder: identity.role === 'founder',
        isComped: identity.isComped === true,
      });
    } catch (error) {
      console.error('Error fetching user mode:', error);
      res.status(500).json({ error: 'Failed to fetch user mode' });
    }
  });

  // Update user mode (validates plan atomically)
  app.post('/api/mode/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { mode } = req.body;
      
      if (!mode || !['personal', 'creator', 'business', 'stage'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      
      // Re-fetch identity right before update to prevent race conditions
      const identity = await storage.getIdentity(address);
      if (!identity) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { getAvailableModesForPlan } = await import('./entitlements');
      
      // Founders, admins, and comped users get all modes
      const hasFullAccess = identity.role === 'founder' || identity.role === 'admin' || identity.isComped === true;
      const allModes: Array<'personal' | 'creator' | 'business' | 'stage'> = ['personal', 'creator', 'business', 'stage'];
      const availableModes = hasFullAccess ? allModes : getAvailableModesForPlan(identity.plan);
      
      // Validate mode is allowed for current plan (prevents race condition attacks)
      if (!availableModes.includes(mode)) {
        return res.status(403).json({ 
          error: 'Mode not available for your plan',
          availableModes,
          currentPlan: identity.plan
        });
      }
      
      // Use atomic update with plan validation inside storage (skip validation for full access users)
      const updated = hasFullAccess 
        ? await storage.createOrUpdateUserModeSettings(address, mode)
        : await storage.updateUserModeWithPlanValidation(address, mode, identity.plan);
      
      if (!updated) {
        return res.status(403).json({ 
          error: 'Mode not available for your plan',
          availableModes,
          currentPlan: identity.plan
        });
      }
      
      res.json({
        mode: updated.mode,
        flags: updated.flags,
        availableModes,
      });
    } catch (error) {
      console.error('Error updating user mode:', error);
      res.status(500).json({ error: 'Failed to update user mode' });
    }
  });

  // Get effective entitlements (full Phase 5 entitlements)
  app.get('/api/me/entitlements/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { getEffectiveEntitlements, initializeEntitlements } = await import('./entitlements');
      
      // Initialize defaults if not present
      await initializeEntitlements();
      
      const entitlements = await getEffectiveEntitlements(address);
      res.json(entitlements);
    } catch (error) {
      console.error('Error fetching effective entitlements:', error);
      res.status(500).json({ error: 'Failed to fetch entitlements' });
    }
  });

  // FREEZE MODE ENDPOINTS
  
  // Get freeze mode settings
  app.get('/api/freeze-mode/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const settings = await storage.getFreezeModeSetting(address);
      const alwaysAllowed = await storage.getAlwaysAllowedContacts(address);
      res.json({
        ...settings,
        alwaysAllowedCount: alwaysAllowed.length
      });
    } catch (error) {
      console.error('Error fetching freeze mode settings:', error);
      res.status(500).json({ error: 'Failed to fetch freeze mode settings' });
    }
  });

  // Toggle freeze mode
  app.put('/api/freeze-mode/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { enabled } = req.body;
      
      const identity = await storage.setFreezeMode(address, enabled);
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found' });
      }
      
      res.json({ 
        freezeMode: identity.freezeMode,
        freezeModeSetupCompleted: identity.freezeModeSetupCompleted
      });
    } catch (error) {
      console.error('Error updating freeze mode:', error);
      res.status(500).json({ error: 'Failed to update freeze mode' });
    }
  });

  // Mark freeze mode setup as completed
  app.put('/api/freeze-mode/:address/setup-complete', async (req, res) => {
    try {
      const { address } = req.params;
      
      const identity = await storage.setFreezeModeSetupCompleted(address);
      if (!identity) {
        return res.status(404).json({ error: 'Identity not found' });
      }
      
      res.json({ 
        freezeMode: identity.freezeMode,
        freezeModeSetupCompleted: identity.freezeModeSetupCompleted
      });
    } catch (error) {
      console.error('Error completing freeze mode setup:', error);
      res.status(500).json({ error: 'Failed to complete freeze mode setup' });
    }
  });

  // Get always allowed contact addresses for an owner
  app.get('/api/contacts/:ownerAddress/always-allowed', async (req, res) => {
    try {
      const { ownerAddress } = req.params;
      const contacts = await storage.getAlwaysAllowedContacts(ownerAddress);
      res.json({ alwaysAllowed: contacts.map(c => c.contactAddress) });
    } catch (error) {
      console.error('Error fetching always allowed contacts:', error);
      res.status(500).json({ error: 'Failed to fetch always allowed contacts' });
    }
  });

  // Toggle always allowed on a contact
  app.put('/api/contacts/:ownerAddress/:contactAddress/always-allowed', async (req, res) => {
    try {
      const { ownerAddress, contactAddress } = req.params;
      const { alwaysAllowed } = req.body;
      
      const contact = await storage.setContactAlwaysAllowed(ownerAddress, contactAddress, alwaysAllowed);
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      
      res.json(contact);
    } catch (error) {
      console.error('Error updating always allowed:', error);
      res.status(500).json({ error: 'Failed to update always allowed' });
    }
  });

  // Get always allowed contacts
  app.get('/api/freeze-mode/:address/always-allowed', async (req, res) => {
    try {
      const { address } = req.params;
      const contacts = await storage.getAlwaysAllowedContacts(address);
      res.json(contacts);
    } catch (error) {
      console.error('Error fetching always allowed contacts:', error);
      res.status(500).json({ error: 'Failed to fetch always allowed contacts' });
    }
  });

  // ===== VOICEMAIL API =====

  // Get all voicemails for a user
  app.get('/api/voicemails/:recipientAddress', async (req, res) => {
    try {
      const { recipientAddress } = req.params;
      const voicemails = await storage.getVoicemails(recipientAddress);
      res.json(voicemails);
    } catch (error) {
      console.error('Error fetching voicemails:', error);
      res.status(500).json({ error: 'Failed to fetch voicemails' });
    }
  });

  // Get unread voicemail count
  app.get('/api/voicemails/:recipientAddress/unread-count', async (req, res) => {
    try {
      const { recipientAddress } = req.params;
      const count = await storage.getUnreadVoicemailCount(recipientAddress);
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  // Get a single voicemail
  app.get('/api/voicemail/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const voicemail = await storage.getVoicemail(id);
      if (!voicemail) {
        return res.status(404).json({ error: 'Voicemail not found' });
      }
      res.json(voicemail);
    } catch (error) {
      console.error('Error fetching voicemail:', error);
      res.status(500).json({ error: 'Failed to fetch voicemail' });
    }
  });

  // Create a voicemail (leave a message - audio or text)
  app.post('/api/voicemails', async (req, res) => {
    try {
      const { recipientAddress, senderAddress, senderName, messageType, audioData, audioFormat, durationSeconds, textContent } = req.body;
      
      // Either audio or text content required
      if (!recipientAddress || !senderAddress || (!audioData && !textContent)) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const isTextOnly = messageType === 'text' || (!audioData && textContent);
      
      const voicemail = await storage.createVoicemail({
        recipientAddress,
        senderAddress,
        senderName: senderName || undefined,
        messageType: isTextOnly ? 'text' : 'audio',
        textContent: textContent || undefined,
        audioData: audioData || undefined,
        audioFormat: audioData ? (audioFormat || 'webm') : undefined,
        durationSeconds: durationSeconds || undefined,
        transcriptionStatus: isTextOnly ? 'text_only' : 'pending',
        transcription: isTextOnly ? textContent : undefined,
      });
      
      res.status(201).json(voicemail);
    } catch (error) {
      console.error('Error creating voicemail:', error);
      res.status(500).json({ error: 'Failed to create voicemail' });
    }
  });

  // Mark voicemail as read
  app.put('/api/voicemail/:id/read', async (req, res) => {
    try {
      const { id } = req.params;
      const voicemail = await storage.markVoicemailRead(id);
      if (!voicemail) {
        return res.status(404).json({ error: 'Voicemail not found' });
      }
      res.json(voicemail);
    } catch (error) {
      console.error('Error marking voicemail as read:', error);
      res.status(500).json({ error: 'Failed to mark voicemail as read' });
    }
  });

  // Save/unsave voicemail
  app.put('/api/voicemail/:id/save', async (req, res) => {
    try {
      const { id } = req.params;
      const { isSaved } = req.body;
      const voicemail = await storage.updateVoicemail(id, { isSaved });
      if (!voicemail) {
        return res.status(404).json({ error: 'Voicemail not found' });
      }
      res.json(voicemail);
    } catch (error) {
      console.error('Error saving voicemail:', error);
      res.status(500).json({ error: 'Failed to save voicemail' });
    }
  });

  // Delete voicemail (soft delete)
  app.delete('/api/voicemail/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteVoicemail(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Voicemail not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting voicemail:', error);
      res.status(500).json({ error: 'Failed to delete voicemail' });
    }
  });

  // Admin: Update user plan (admin/founder only)
  app.put('/api/admin/users/:address/plan', async (req, res) => {
    try {
      const { address } = req.params;
      const { plan, actorAddress, signature, timestamp } = req.body;
      
      // Verify admin signature
      if (!actorAddress || !signature || !timestamp) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }
      
      // Check timestamp freshness (5 minute window for admin requests)
      if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request expired' });
      }
      
      // Verify actor is admin
      const actorIdentity = await storage.getIdentity(actorAddress);
      if (!actorIdentity || (actorIdentity.role !== 'admin' && actorIdentity.role !== 'founder')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      // Verify signature
      try {
        const message = `admin:plan:${address}:${plan}:${timestamp}`;
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(actorIdentity.publicKeyBase58);
        
        const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } catch (error) {
        return res.status(401).json({ error: 'Signature verification failed' });
      }
      
      const validPlans = ['free', 'pro', 'business', 'enterprise'];
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      
      const updated = await storage.updatePlan(address, plan, actorAddress);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating plan:', error);
      res.status(500).json({ error: 'Failed to update plan' });
    }
  });

  // Admin stats endpoint
  app.get('/api/admin/stats', async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // Invite Links API
  
  // Get all invite links (admin only)
  app.get('/api/admin/invite-links', async (req, res) => {
    try {
      const links = await storage.getAllInviteLinks();
      res.json(links);
    } catch (error) {
      console.error('Error fetching invite links:', error);
      res.status(500).json({ error: 'Failed to fetch invite links' });
    }
  });

  // Create invite link (admin only)
  app.post('/api/admin/invite-links', async (req, res) => {
    try {
      const { createdByAddress, type, trialDays, trialMinutes, grantPlan, maxUses, expiresAt, signature, timestamp } = req.body;
      
      // Verify admin signature
      if (!createdByAddress || !signature || !timestamp) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }
      
      // Check timestamp freshness
      if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return res.status(401).json({ error: 'Request expired' });
      }
      
      // Verify actor is admin
      const actorIdentity = await storage.getIdentity(createdByAddress);
      if (!actorIdentity || (actorIdentity.role !== 'admin' && actorIdentity.role !== 'founder' && actorIdentity.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      // Verify signature cryptographically
      const message = `admin:create-invite:${createdByAddress}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const pubKeyBytes = bs58.decode(createdByAddress.replace('call:', '').split(':')[0]);
      
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubKeyBytes);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Generate unique code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const link = await storage.createInviteLink({
        code,
        createdByAddress,
        type: type || 'trial',
        trialDays: trialDays ?? 7,
        trialMinutes: trialMinutes ?? 30,
        grantPlan: grantPlan || 'pro',
        maxUses: maxUses || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      });
      
      // Log the action
      await storage.createAuditLog({
        actorAddress: createdByAddress,
        actionType: 'CREATE_INVITE_LINK',
        metadata: { linkId: link.id, code: link.code, type: link.type }
      });
      
      res.json(link);
    } catch (error) {
      console.error('Error creating invite link:', error);
      res.status(500).json({ error: 'Failed to create invite link' });
    }
  });

  // Delete/deactivate invite link (admin only)
  app.delete('/api/admin/invite-links/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { actorAddress } = req.body;
      
      // Verify actor is admin
      const actorIdentity = await storage.getIdentity(actorAddress);
      if (!actorIdentity || (actorIdentity.role !== 'admin' && actorIdentity.role !== 'founder')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      await storage.updateInviteLink(id, { isActive: false });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting invite link:', error);
      res.status(500).json({ error: 'Failed to delete invite link' });
    }
  });

  // Public: Get invite link info (for /invite/:code page)
  app.get('/api/invite/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const link = await storage.getInviteLink(code);
      
      if (!link) {
        return res.status(404).json({ error: 'Invite link not found' });
      }
      
      if (!link.isActive) {
        return res.status(410).json({ error: 'Invite link is no longer active' });
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ error: 'Invite link has expired' });
      }
      
      if (link.maxUses && link.uses !== null && link.uses >= link.maxUses) {
        return res.status(410).json({ error: 'Invite link has reached maximum uses' });
      }
      
      // Return public-safe info only
      res.json({
        code: link.code,
        type: link.type,
        trialDays: link.trialDays,
        trialMinutes: link.trialMinutes,
        grantPlan: link.grantPlan,
        isValid: true,
        creatorDisplayName: link.creatorDisplayName,
        contactName: link.contactName,
      });
    } catch (error) {
      console.error('Error fetching invite link:', error);
      res.status(500).json({ error: 'Failed to fetch invite link' });
    }
  });

  // User: Create contact invite (any user can create)
  app.post('/api/contact-invite', async (req, res) => {
    try {
      const { creatorAddress, contactName, creatorDisplayName } = req.body;
      
      if (!creatorAddress || !contactName) {
        return res.status(400).json({ error: 'Creator address and contact name required' });
      }
      
      // Generate unique invite code
      const code = `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      
      const link = await storage.createInviteLink({
        code,
        createdByAddress: creatorAddress,
        type: 'contact',
        trialDays: 0,
        trialMinutes: 0,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        isActive: true,
        contactName,
        creatorDisplayName: creatorDisplayName || null,
      });
      
      // Get the app URL for sharing
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : '');
      
      res.json({ 
        success: true, 
        code: link.code,
        inviteUrl: `${baseUrl}/invite/${link.code}`,
        contactName,
      });
    } catch (error) {
      console.error('Error creating contact invite:', error);
      res.status(500).json({ error: 'Failed to create invite' });
    }
  });
  
  // Get user's sent invites
  app.get('/api/contact-invites/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const invites = await storage.getInviteLinksByCreator(address);
      res.json(invites.filter(i => i.type === 'contact'));
    } catch (error) {
      console.error('Error fetching invites:', error);
      res.status(500).json({ error: 'Failed to fetch invites' });
    }
  });

  // Public: Redeem invite link
  app.post('/api/invite/:code/redeem', async (req, res) => {
    try {
      const { code } = req.params;
      const { redeemerAddress } = req.body;
      
      if (!redeemerAddress) {
        return res.status(400).json({ error: 'Redeemer address required' });
      }
      
      // Get the invite link first to get contact info
      const link = await storage.getInviteLink(code);
      if (!link) {
        return res.status(404).json({ error: 'Invite not found' });
      }
      
      const result = await storage.redeemInviteLink(code, redeemerAddress);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      // If this is a contact invite, create mutual contacts
      if (link.type === 'contact' && link.contactName) {
        // Create contact for the invite creator (they save redeemer with the name they specified)
        await storage.createOrUpdateContact(
          link.createdByAddress,
          redeemerAddress,
          link.contactName
        );
        
        // Create contact for the redeemer (they save the creator with their display name)
        if (link.creatorDisplayName) {
          await storage.createOrUpdateContact(
            redeemerAddress,
            link.createdByAddress,
            link.creatorDisplayName
          );
        }
        
        console.log(`Contact invite redeemed: ${link.createdByAddress} <-> ${redeemerAddress} (${link.contactName})`);
      }
      
      res.json({ 
        success: true, 
        trialDays: result.link?.trialDays,
        trialMinutes: result.link?.trialMinutes,
        grantPlan: result.link?.grantPlan,
        contactCreated: link.type === 'contact',
        creatorAddress: link.createdByAddress,
        creatorDisplayName: link.creatorDisplayName,
      });
    } catch (error) {
      console.error('Error redeeming invite link:', error);
      res.status(500).json({ error: 'Failed to redeem invite link' });
    }
  });

  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  // Keep-alive ping interval (every 30 seconds)
  const PING_INTERVAL = 30000;
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    let clientAddress: string | null = null;
    let isAlive = true;
    
    // Set up ping/pong keep-alive
    ws.on('pong', () => {
      isAlive = true;
    });
    
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        console.log('WebSocket client not responding to ping, terminating');
        clearInterval(pingInterval);
        return ws.terminate();
      }
      isAlive = false;
      ws.ping();
    }, PING_INTERVAL);
    
    ws.on('close', () => {
      clearInterval(pingInterval);
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'ping': {
            // Respond to client ping with pong
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          }
          
          case 'register': {
            const { address } = message;
            clientAddress = address;
            const connectionId = randomUUID();
            (ws as any).__connectionId = connectionId; // Store connectionId on ws for cleanup
            addConnection(address, { ws, address, connectionId });
            ws.send(JSON.stringify({ type: 'success', message: 'Registered successfully' } as WSMessage));
            console.log(`Client registered: ${address}`);
            
            // Deliver any pending messages for this user
            storage.getPendingMessages(address).then(async (pendingMsgs) => {
              for (const pendingMsg of pendingMsgs) {
                try {
                  ws.send(JSON.stringify({
                    type: 'msg:incoming',
                    message: {
                      id: pendingMsg.id,
                      convo_id: pendingMsg.convoId,
                      from_address: pendingMsg.fromAddress,
                      to_address: pendingMsg.toAddress,
                      content: pendingMsg.content,
                      type: pendingMsg.mediaType || 'text',
                      timestamp: pendingMsg.createdAt.getTime(),
                      status: 'delivered'
                    },
                    from_pubkey: '' // Pubkey not stored for pending messages
                  } as WSMessage));
                  
                  // Mark as delivered
                  await storage.markMessageDelivered(pendingMsg.id);
                  console.log(`Delivered pending message ${pendingMsg.id} to ${address}`);
                  
                  // Notify sender if online
                  broadcastToAddress(pendingMsg.fromAddress, {
                      type: 'msg:delivered',
                      message_id: pendingMsg.id,
                      convo_id: pendingMsg.convoId,
                      delivered_at: Date.now()
                    });
                } catch (e) {
                  console.error('Error delivering pending message:', e);
                }
              }
              if (pendingMsgs.length > 0) {
                console.log(`Delivered ${pendingMsgs.length} pending messages to ${address}`);
              }
            }).catch(console.error);
            break;
          }

          case 'call:init': {
            const { data: signedIntent, pass_id } = message;
            
            // Validate signedIntent structure before accessing properties
            if (!signedIntent || !signedIntent.intent) {
              console.error('[call:init] Invalid signedIntent structure:', JSON.stringify(signedIntent).slice(0, 200));
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid call data', reason: 'invalid_structure' } as WSMessage));
              return;
            }
            
            if (!checkRateLimit(signedIntent.intent.from_address)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' } as WSMessage));
              return;
            }
            
            const verifyResult = verifySignatureWithDetails(signedIntent);
            if (!verifyResult.valid) {
              console.log(`[call:init] Signature verification failed: ${verifyResult.reason} for ${signedIntent.intent.from_address?.slice(0, 20)}...`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid signature or expired timestamp',
                reason: verifyResult.reason || 'verification_failed'
              } as WSMessage));
              return;
            }
            
            if (!isConnectionForAddress(signedIntent.intent.from_address, ws)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address spoofing detected' } as WSMessage));
              return;
            }
            
            const callerAddr = signedIntent.intent.from_address;
            const recipientAddr = signedIntent.intent.to_address;
            const mediaObj = signedIntent.intent.media || { audio: true, video: false };
            const mediaType = mediaObj.video ? 'video' : 'audio';
            
            console.log(`[call:init] ${callerAddr.slice(0, 12)}... calling ${recipientAddr.slice(0, 12)}... (${mediaType})`);
            
            // Check if recipient is online with an active connection
            let targetConnection = getConnection(recipientAddr);
            
            if (!targetConnection) {
              // Recipient not immediately available - tell caller we're connecting
              console.log(`[call:init] Recipient ${recipientAddr.slice(0, 12)}... not immediately online`);
              ws.send(JSON.stringify({ 
                type: 'call:connecting', 
                message: 'Connecting to recipient...',
                to_address: recipientAddr
              } as WSMessage));
              
              // Get caller's display name for notification
              const callerIdentity = await storage.getIdentity(callerAddr);
              const callerContact = await storage.getContact(recipientAddr, callerAddr);
              const callerName = callerContact?.name || callerIdentity?.displayName || callerAddr.slice(0, 12) + '...';
              
              // Try to send push notification to wake up the recipient
              const callSessionId = randomUUID();
              const pushSent = await sendPushNotification(recipientAddr, {
                type: 'incoming_call',
                title: 'Incoming Call',
                body: `${callerName} is calling you`,
                from_address: callerAddr,
                tag: 'incoming-call',
                sessionId: callSessionId,
                callType: mediaType,
                url: `/app?incoming=1&session=${callSessionId}&type=${mediaType}`
              });
              
              if (pushSent) {
                console.log(`[call:init] Push notification sent to ${recipientAddr.slice(0, 12)}...`);
              }
              
              // Wait up to 30 seconds for recipient to come online (increased from 15)
              let waitTime = 0;
              const checkInterval = 500; // Check every 500ms for faster response
              const maxWait = 30000;
              
              while (waitTime < maxWait) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                waitTime += checkInterval;
                
                // Re-check for connection
                targetConnection = getConnection(recipientAddr);
                if (targetConnection) {
                  // Recipient came online! Forward the call
                  console.log(`[call:init] Recipient ${recipientAddr.slice(0, 12)}... came online after ${waitTime}ms`);
                  targetConnection.ws.send(JSON.stringify({
                    type: 'call:incoming',
                    from_address: callerAddr,
                    from_pubkey: signedIntent.intent.from_pubkey,
                    media: mediaObj
                  } as WSMessage));
                  
                  // Tell caller the call is ringing
                  ws.send(JSON.stringify({ 
                    type: 'call:ringing', 
                    message: 'Ringing...',
                    to_address: recipientAddr
                  } as WSMessage));
                  return;
                }
                
                // Send periodic updates to caller (every 5 seconds)
                if (waitTime % 5000 === 0 && waitTime < maxWait) {
                  ws.send(JSON.stringify({ 
                    type: 'call:connecting', 
                    message: 'Still connecting...',
                    to_address: recipientAddr
                  } as WSMessage));
                }
              }
              
              // Recipient didn't come online - record missed call
              storage.storeMessage(
                callerAddr,
                recipientAddr,
                `missed-call-${callerAddr}-${recipientAddr}`,
                `Missed ${mediaType} call`,
                'system',
                undefined
              ).catch(console.error);
              
              console.log(`[call:init] Recipient ${recipientAddr.slice(0, 12)}... offline after ${maxWait}ms - recorded missed call`);
              
              // Tell caller the recipient is unavailable
              ws.send(JSON.stringify({ 
                type: 'call:unavailable', 
                reason: 'Recipient is currently unavailable. They will see your missed call.',
                to_address: recipientAddr
              } as WSMessage));
              return;
            }
            
            console.log(`[call:init] Recipient ${recipientAddr.slice(0, 12)}... is online, forwarding call`);
            
            // Recipient is online - send "ringing" status to caller
            ws.send(JSON.stringify({ 
              type: 'call:ringing', 
              message: 'Ringing...',
              to_address: recipientAddr
            } as WSMessage));
            
            const recipientAddress = signedIntent.intent.to_address;
            const callerAddress = signedIntent.intent.from_address;
            
            // Free Tier Shield enforcement (async)
            (async () => {
              try {
                // Record call attempt for free tier tracking
                await FreeTierShield.recordCallAttempt(callerAddress);
                
                // Check if caller and callee have contact relationship (either direction)
                const callerContact = await storage.getContact(callerAddress, recipientAddress);
                const calleeContact = await storage.getContact(recipientAddress, callerAddress);
                const isMutualContact = !!(callerContact && calleeContact);
                const isEitherContact = !!(callerContact || calleeContact); // EITHER party added the other
                const isContact = !!callerContact;
                const isPaidCall = !!pass_id; // has paid pass
                
                // Free Tier Shield: Check if caller can start this call
                const shieldCheck = await FreeTierShield.canStartCall(callerAddress, recipientAddress, {
                  isContact,
                  isMutualContact,
                  isEitherContact,
                  isGroupCall: false,
                  isExternalLink: false,
                  isPaidCall
                });
                
                if (!shieldCheck.allowed) {
                  // Record failed start
                  await FreeTierShield.recordFailedStart(callerAddress);
                  
                  ws.send(JSON.stringify({
                    type: 'call:blocked',
                    reason: shieldCheck.message || 'Call blocked by free tier limits',
                    errorCode: shieldCheck.errorCode
                  } as WSMessage));
                  console.log(`Free tier shield blocked call from ${callerAddress}: ${shieldCheck.errorCode}`);
                  return;
                }
                
                // Free Tier Shield: Check if callee can receive this call
                const calleeShieldCheck = await FreeTierShield.canReceiveCall(recipientAddress, callerAddress, {
                  isMutualContact,
                  isEitherContact
                });
                
                if (!calleeShieldCheck.allowed) {
                  ws.send(JSON.stringify({
                    type: 'call:blocked',
                    reason: calleeShieldCheck.message || 'Recipient cannot receive this call',
                    errorCode: calleeShieldCheck.errorCode
                  } as WSMessage));
                  console.log(`Free tier shield blocked inbound call to ${recipientAddress}: ${calleeShieldCheck.errorCode}`);
                  return;
                }
                
                // FREEZE MODE ENFORCEMENT
                const freezeSettings = await storage.getFreezeModeSetting(recipientAddress);
                if (freezeSettings.enabled) {
                  // Check if caller is always allowed (emergency bypass)
                  const isAlwaysAllowed = await storage.isContactAlwaysAllowed(recipientAddress, callerAddress);
                  
                  // Freeze Mode allows: always-allowed contacts, paid calls, or approved contacts
                  if (!isAlwaysAllowed && !isPaidCall) {
                    // Check if caller is an approved contact (has a contact record)
                    if (!calleeContact) {
                      // Caller is not approved - require call request instead of ringing
                      const request: CallRequest = {
                        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        from_address: callerAddress,
                        to_address: recipientAddress,
                        is_video: signedIntent.intent.media.video,
                        timestamp: Date.now(),
                        status: 'pending'
                      };
                      policyStore.createCallRequest(request);
                      
                      targetConnection.ws.send(JSON.stringify({
                        type: 'call:request',
                        request
                      } as WSMessage));
                      
                      ws.send(JSON.stringify({
                        type: 'call:blocked',
                        reason: 'Recipient has Freeze Mode enabled. Call request sent for approval.',
                        errorCode: 'FREEZE_MODE_REQUEST'
                      } as WSMessage));
                      console.log(`Freeze Mode: ${callerAddress} → ${recipientAddress} converted to call request`);
                      return;
                    }
                  }
                }
                
                // DO NOT DISTURB (DND) ENFORCEMENT
                const callIdSettings = await storage.getCallIdSettings(recipientAddress);
                if (callIdSettings?.doNotDisturb) {
                  // Check if caller is emergency/always-allowed contact (bypasses DND)
                  const isAlwaysAllowed = await storage.isContactAlwaysAllowed(recipientAddress, callerAddress);
                  
                  if (!isAlwaysAllowed && !isPaidCall) {
                    // DND is active - route to voicemail
                    const callerIdentity = await storage.getIdentity(callerAddress);
                    const callerContactInfo = await storage.getContact(recipientAddress, callerAddress);
                    const callerDisplayName = callerContactInfo?.name || callerIdentity?.displayName || callerAddress.slice(0, 12) + '...';
                    
                    // Store missed call notification
                    storage.storeMessage(
                      callerAddress,
                      recipientAddress,
                      `missed-call-dnd-${callerAddress}-${recipientAddress}`,
                      `Missed ${signedIntent.intent.media.video ? 'video' : 'voice'} call (DND was active)`,
                      'system',
                      undefined
                    ).catch(console.error);
                    
                    // Send silent push notification about missed call
                    sendPushNotification(recipientAddress, {
                      type: 'missed_call_dnd',
                      title: 'Missed Call (DND)',
                      body: `${callerDisplayName} tried to call while Do Not Disturb was active`,
                      from_address: callerAddress,
                      tag: 'missed-call-dnd'
                    }).catch(console.error);
                    
                    // Tell caller about DND - offer voicemail
                    ws.send(JSON.stringify({
                      type: 'call:dnd',
                      reason: 'User is in Do Not Disturb mode. Please leave a voicemail.',
                      to_address: recipientAddress,
                      voicemail_enabled: callIdSettings.voicemailEnabled !== false
                    } as WSMessage));
                    
                    console.log(`DND: Call from ${callerAddress} to ${recipientAddress} blocked - routed to voicemail`);
                    return;
                  }
                }
                
                // Continue with existing policy evaluation
                policyStore.recordCallAttempt(recipientAddress, callerAddress);
                
                const decision = policyStore.evaluateCallPolicy(
                  recipientAddress,
                  callerAddress,
                  isContact,
                  pass_id
                );
                
                switch (decision.action) {
                  case 'block':
                    await FreeTierShield.recordFailedStart(callerAddress);
                    ws.send(JSON.stringify({
                      type: 'call:blocked',
                      reason: decision.reason
                    } as WSMessage));
                    console.log(`Call blocked from ${callerAddress} to ${recipientAddress}: ${decision.reason}`);
                    break;
                    
                  case 'request': {
                    const request: CallRequest = {
                      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                      from_address: callerAddress,
                      to_address: recipientAddress,
                      is_video: signedIntent.intent.media.video,
                      timestamp: Date.now(),
                      status: 'pending'
                    };
                    policyStore.createCallRequest(request);
                    
                    targetConnection.ws.send(JSON.stringify({
                      type: 'call:request',
                      request
                    } as WSMessage));
                    
                    ws.send(JSON.stringify({
                      type: 'success',
                      message: 'Call request sent. Waiting for recipient approval.'
                    } as WSMessage));
                    console.log(`Call request sent from ${callerAddress} to ${recipientAddress}`);
                    break;
                  }
                  
                  case 'auto_reply': {
                    const dmConvo = messageStore.getOrCreateDirectConversation(recipientAddress, callerAddress);
                    const autoMsg: Message = {
                      id: `auto_${Date.now()}`,
                      convo_id: dmConvo.id,
                      from_address: recipientAddress,
                      to_address: callerAddress,
                      timestamp: Date.now(),
                      type: 'text',
                      content: `[Automated] ${decision.message}`,
                      nonce: Math.random().toString(36).slice(2),
                      status: 'sent'
                    };
                    messageStore.addMessage(autoMsg);
                    
                    ws.send(JSON.stringify({
                      type: 'msg:incoming',
                      message: autoMsg,
                      from_pubkey: ''
                    } as WSMessage));
                    
                    ws.send(JSON.stringify({
                      type: 'call:blocked',
                      reason: 'Auto-reply sent: ' + decision.message
                    } as WSMessage));
                    console.log(`Auto-reply sent from ${recipientAddress} to ${callerAddress}`);
                    break;
                  }
                  
                  case 'ring': {
                    if (pass_id) {
                      policyStore.consumePass(pass_id);
                    }
                    
                    // Include max call duration for free tier users
                    const maxDuration = shieldCheck.maxDurationSeconds;
                    
                    targetConnection.ws.send(JSON.stringify({
                      type: 'call:incoming',
                      from_address: callerAddress,
                      from_pubkey: signedIntent.intent.from_pubkey,
                      media: signedIntent.intent.media,
                      is_unknown: decision.is_unknown,
                      maxDurationSeconds: maxDuration
                    } as WSMessage));
                    
                    console.log(`Call initiated from ${callerAddress} to ${recipientAddress}`);
                    break;
                  }
                }
              } catch (error) {
                console.error('Error in Free Tier Shield check:', error);
                ws.send(JSON.stringify({ type: 'error', message: 'Failed to process call' } as WSMessage));
              }
            })();
            break;
          }
          
          case 'call:request_response': {
            const { request_id, accepted } = message;
            const request = policyStore.getCallRequest(request_id);
            
            if (!request) {
              ws.send(JSON.stringify({ type: 'error', message: 'Request not found' } as WSMessage));
              return;
            }
            
            if (request.to_address !== clientAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authorized' } as WSMessage));
              return;
            }
            
            policyStore.updateCallRequest(request_id, accepted ? 'accepted' : 'declined');
            
            const callerConnection = getConnection(request.from_address);
            if (callerConnection) {
              if (accepted) {
                callerConnection.ws.send(JSON.stringify({
                  type: 'success',
                  message: 'Call request accepted. You can now call.'
                } as WSMessage));
              } else {
                policyStore.recordRejection(request.to_address, request.from_address);
                callerConnection.ws.send(JSON.stringify({
                  type: 'call:blocked',
                  reason: 'Call request declined'
                } as WSMessage));
              }
            }
            break;
          }

          case 'call:accept': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            
            // Record call start for Free Tier Shield tracking
            const acceptMsg = message as any;
            if (acceptMsg.callSessionId && clientAddress) {
              (async () => {
                try {
                  await FreeTierShield.recordCallStart(
                    message.to_address, // caller
                    clientAddress,       // callee (accepter)
                    acceptMsg.callSessionId
                  );
                } catch (error) {
                  console.error('Error recording call start:', error);
                }
              })();
            }
            break;
          }
          
          case 'call:reject': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            
            // Record as failed start for free tier
            if (clientAddress) {
              FreeTierShield.recordFailedStart(message.to_address).catch(console.error);
            }
            break;
          }
          
          case 'call:end': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            
            // Record call end for Free Tier Shield tracking
            const endMsg = message as any;
            if (endMsg.callSessionId && endMsg.durationSeconds !== undefined) {
              FreeTierShield.recordCallEnd(endMsg.callSessionId, endMsg.durationSeconds).catch(console.error);
            }
            break;
          }

          case 'webrtc:offer':
          case 'webrtc:answer':
          case 'webrtc:ice': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            break;
          }

          // Call Waiting (phone-like)
          case 'call:hold': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection && clientAddress) {
              targetConnection.ws.send(JSON.stringify({
                type: 'call:held',
                by_address: clientAddress
              } as WSMessage));
            }
            break;
          }

          case 'call:resume': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection && clientAddress) {
              targetConnection.ws.send(JSON.stringify({
                type: 'call:resumed',
                by_address: clientAddress
              } as WSMessage));
            }
            break;
          }

          case 'call:busy_waiting': {
            const targetConnection = getConnection(message.to_address);
            if (targetConnection && clientAddress) {
              targetConnection.ws.send(JSON.stringify({
                type: 'call:waiting',
                from_address: clientAddress,
                from_pubkey: getConnection(clientAddress)?.pubkey || '',
                media: { audio: true, video: false }
              } as WSMessage));
            }
            break;
          }

          // Group Calls (room-based mesh WebRTC)
          case 'room:create': {
            if (!clientAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' } as WSMessage));
              break;
            }

            // Check plan limits
            const identity = await storage.getIdentity(clientAddress);
            const plan = identity?.plan || 'free';
            if (plan === 'free') {
              ws.send(JSON.stringify({ type: 'room:error', message: 'Upgrade to Pro to use group calls' } as WSMessage));
              break;
            }

            const maxParticipants = plan === 'business' ? 10 : 6;
            const requestedMax = Math.min(maxParticipants, 10);

            try {
              const room = await storage.createCallRoom(
                clientAddress,
                message.is_video,
                message.name,
                requestedMax
              );

              // Add host as first participant
              await storage.addRoomParticipant(room.id, clientAddress, undefined, true);

              const roomData: GroupCallRoom = {
                id: room.id,
                room_code: room.roomCode,
                host_address: clientAddress,
                name: message.name,
                is_video: message.is_video,
                is_locked: false,
                max_participants: requestedMax,
                status: 'active',
                created_at: Date.now()
              };

              ws.send(JSON.stringify({ type: 'room:created', room: roomData } as WSMessage));

              // Send invites to participants
              for (const addr of message.participant_addresses || []) {
                broadcastToAddress(addr, {
                    type: 'room:invite',
                    room_id: room.id,
                    to_address: addr,
                    from_address: clientAddress,
                    is_video: message.is_video
                  });
              }
            } catch (error) {
              console.error('Error creating room:', error);
              ws.send(JSON.stringify({ type: 'room:error', message: 'Failed to create room' } as WSMessage));
            }
            break;
          }

          case 'room:join': {
            if (!clientAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' } as WSMessage));
              break;
            }

            try {
              // Validate joiner's plan allows group calls
              const joinerIdentity = await storage.getIdentity(clientAddress);
              const joinerPlan = joinerIdentity?.plan || 'free';
              if (joinerPlan === 'free') {
                ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Upgrade to Pro to join group calls' } as WSMessage));
                break;
              }

              const room = await storage.getCallRoom(message.room_id);
              if (!room) {
                ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Room not found' } as WSMessage));
                break;
              }

              if (room.status !== 'active') {
                ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Room has ended' } as WSMessage));
                break;
              }

              if (room.isLocked) {
                ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Room is locked', reason: 'locked' } as WSMessage));
                break;
              }

              const participantCount = await storage.getRoomParticipantCount(message.room_id);
              if (participantCount >= room.maxParticipants) {
                ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Room is full', reason: 'full' } as WSMessage));
                break;
              }

              // Check if already in room
              const alreadyIn = await storage.isUserInRoom(message.room_id, clientAddress);
              if (!alreadyIn) {
                await storage.addRoomParticipant(message.room_id, clientAddress);
              }

              // Get all participants
              const participants = await storage.getRoomParticipants(message.room_id);

              const roomData: GroupCallRoom = {
                id: room.id,
                room_code: room.roomCode,
                host_address: room.hostAddress,
                name: room.name || undefined,
                is_video: room.isVideo,
                is_locked: room.isLocked,
                max_participants: room.maxParticipants,
                status: room.status as 'active' | 'ended',
                created_at: room.createdAt.getTime()
              };

              const participantData: GroupCallParticipant[] = participants.map(p => ({
                user_address: p.userAddress,
                display_name: p.displayName || undefined,
                is_host: p.isHost,
                is_muted: p.isMuted,
                is_video_off: p.isVideoOff,
                joined_at: p.joinedAt.getTime()
              }));

              ws.send(JSON.stringify({
                type: 'room:joined',
                room: roomData,
                participants: participantData
              } as WSMessage));

              // Notify other participants
              const newParticipant: GroupCallParticipant = {
                user_address: clientAddress,
                is_host: false,
                is_muted: false,
                is_video_off: false,
                joined_at: Date.now()
              };

              for (const p of participants) {
                if (p.userAddress !== clientAddress) {
                  broadcastToAddress(p.userAddress, {
                      type: 'room:participant_joined',
                      room_id: message.room_id,
                      participant: newParticipant
                    });
                }
              }
            } catch (error) {
              console.error('Error joining room:', error);
              ws.send(JSON.stringify({ type: 'room:error', room_id: message.room_id, message: 'Failed to join room' } as WSMessage));
            }
            break;
          }

          case 'room:leave': {
            if (!clientAddress) break;

            try {
              await storage.removeRoomParticipant(message.room_id, message.from_address || clientAddress);

              // Notify other participants
              const participants = await storage.getRoomParticipants(message.room_id);
              for (const p of participants) {
                broadcastToAddress(p.userAddress, {
                    type: 'room:participant_left',
                    room_id: message.room_id,
                    user_address: message.from_address || clientAddress
                  });
              }

              // End room if empty
              if (participants.length === 0) {
                await storage.updateCallRoom(message.room_id, { status: 'ended', endedAt: new Date() });
              }
            } catch (error) {
              console.error('Error leaving room:', error);
            }
            break;
          }

          case 'room:lock': {
            if (!clientAddress) break;

            try {
              const room = await storage.getCallRoom(message.room_id);
              if (room && room.hostAddress === clientAddress) {
                await storage.updateCallRoom(message.room_id, { isLocked: message.locked });

                // Notify all participants
                const participants = await storage.getRoomParticipants(message.room_id);
                for (const p of participants) {
                  broadcastToAddress(p.userAddress, {
                      type: 'room:lock',
                      room_id: message.room_id,
                      locked: message.locked
                    });
                }
              }
            } catch (error) {
              console.error('Error locking room:', error);
            }
            break;
          }

          case 'room:end': {
            if (!clientAddress) break;

            try {
              const room = await storage.getCallRoom(message.room_id);
              if (room && room.hostAddress === clientAddress) {
                await storage.updateCallRoom(message.room_id, { status: 'ended', endedAt: new Date() });

                // Notify all participants
                const participants = await storage.getRoomParticipants(message.room_id);
                for (const p of participants) {
                  await storage.removeRoomParticipant(message.room_id, p.userAddress);
                  broadcastToAddress(p.userAddress, {
                      type: 'room:ended',
                      room_id: message.room_id
                    });
                }
              }
            } catch (error) {
              console.error('Error ending room:', error);
            }
            break;
          }

          // Mesh WebRTC signaling for group calls
          case 'mesh:offer':
          case 'mesh:answer':
          case 'mesh:ice': {
            const targetConnection = getConnection(message.to_peer);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            break;
          }

          // Call Merge (merge 1:1 calls into group)
          case 'call:merge': {
            if (!clientAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' } as WSMessage));
              break;
            }

            // Check plan limits
            const mergeIdentity = await storage.getIdentity(clientAddress);
            const mergePlan = mergeIdentity?.plan || 'free';
            if (mergePlan === 'free') {
              ws.send(JSON.stringify({ type: 'room:error', message: 'Upgrade to Pro to use group calls' } as WSMessage));
              break;
            }

            const mergeMaxParticipants = mergePlan === 'business' ? 10 : 6;

            try {
              // Create a new room for merged call
              const room = await storage.createCallRoom(
                clientAddress,
                true, // video by default for merge
                'Merged Call',
                mergeMaxParticipants
              );

              // Add initiator as host
              await storage.addRoomParticipant(room.id, clientAddress, undefined, true);

              // Add all merged participants
              for (const addr of message.call_addresses || []) {
                if (addr !== clientAddress) {
                  await storage.addRoomParticipant(room.id, addr);
                }
              }

              const roomData: GroupCallRoom = {
                id: room.id,
                room_code: room.roomCode,
                host_address: clientAddress,
                name: 'Merged Call',
                is_video: true,
                is_locked: false,
                max_participants: mergeMaxParticipants,
                status: 'active',
                created_at: Date.now()
              };

              // Notify all participants about the merge
              ws.send(JSON.stringify({ type: 'call:merged', room: roomData } as WSMessage));

              for (const addr of message.call_addresses || []) {
                if (addr !== clientAddress) {
                  broadcastToAddress(addr, { type: 'call:merged', room: roomData });
                }
              }
            } catch (error) {
              console.error('Error merging calls:', error);
              ws.send(JSON.stringify({ type: 'room:error', message: 'Failed to merge calls' } as WSMessage));
            }
            break;
          }

          case 'msg:send': {
            const { data: signedMsg } = message;
            
            if (!verifyMessageSignature(signedMsg)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid message signature' } as WSMessage));
              return;
            }
            
            if (!isConnectionForAddress(signedMsg.message.from_address, ws)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address spoofing detected' } as WSMessage));
              return;
            }
            
            const msg = signedMsg.message;
            
            if (messageStore.hasMessage(msg.id, msg.nonce)) {
              ws.send(JSON.stringify({
                type: 'msg:ack',
                message_id: msg.id,
                status: 'duplicate' as const
              } as WSMessage));
              return;
            }
            
            msg.status = 'sent';
            
            // Store to DB with atomic server-assigned seq (WhatsApp-like reliability)
            let serverSeq: number;
            let serverTimestamp: Date;
            try {
              const dbResult = await storage.storeMessageWithSeq(
                msg.from_address,
                msg.to_address,
                msg.convo_id,
                msg.content,
                {
                  mediaType: msg.type,
                  mediaUrl: (msg as any).attachment_url,
                  nonce: msg.nonce,
                  messageType: msg.type,
                  attachmentName: (msg as any).attachment_name,
                  attachmentSize: (msg as any).attachment_size,
                }
              );
              serverSeq = dbResult.seq;
              serverTimestamp = dbResult.serverTimestamp;
              // Apply DB-assigned values to message for consistent broadcasting
              (msg as any).seq = serverSeq;
              (msg as any).server_timestamp = serverTimestamp.getTime();
            } catch (dbError) {
              console.error('Failed to persist message to DB:', dbError);
              // Return error to client instead of silent fallback
              ws.send(JSON.stringify({
                type: 'msg:ack',
                message_id: msg.id,
                status: 'error' as any,
                error: 'Failed to persist message'
              } as WSMessage));
              return;
            }
            
            // Send acknowledgment with server-assigned seq for ordering
            ws.send(JSON.stringify({
              type: 'msg:ack',
              message_id: msg.id,
              status: 'received' as const,
              seq: serverSeq,
              server_timestamp: serverTimestamp.getTime()
            } as WSMessage));
            
            const convo = messageStore.getConversation(msg.convo_id);
            if (convo) {
              messageStore.addMessage(msg);
              messageStore.updateConversationLastMessage(msg.convo_id, msg);
              
              const recipients = convo.participant_addresses.filter(a => a !== msg.from_address);
              for (const recipientAddr of recipients) {
                const recipientConnection = getConnection(recipientAddr);
                if (recipientConnection) {
                  broadcastToAddress(recipientAddr, {
                    type: 'msg:incoming',
                    message: msg,
                    from_pubkey: signedMsg.from_pubkey
                  });
                  
                  msg.status = 'delivered';
                  messageStore.updateMessageStatus(msg.id, 'delivered');
                  ws.send(JSON.stringify({
                    type: 'msg:delivered',
                    message_id: msg.id,
                    convo_id: msg.convo_id,
                    delivered_at: Date.now()
                  } as WSMessage));
                } else {
                  // Recipient offline - store message for later delivery and send push notification
                  storage.storeMessage(
                    msg.from_address,
                    recipientAddr,
                    msg.convo_id,
                    msg.content,
                    msg.type,
                    undefined // media URL for future media support
                  ).then(async () => {
                    console.log(`Stored message for offline delivery to ${recipientAddr}`);
                    
                    // Send push notification to alert the offline recipient
                    const senderIdentity = await storage.getIdentity(msg.from_address);
                    const senderContact = await storage.getContact(recipientAddr, msg.from_address);
                    const senderName = senderContact?.name || senderIdentity?.displayName || msg.from_address.slice(5, 15) + '...';
                    
                    const messagePreview = msg.type === 'text' 
                      ? (msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content)
                      : msg.type === 'voice' ? 'Voice message'
                      : msg.type === 'video' ? 'Video message'
                      : msg.type === 'image' ? 'Photo'
                      : 'New message';
                    
                    await sendPushNotification(recipientAddr, {
                      type: 'message',
                      title: senderName,
                      body: messagePreview,
                      tag: `msg-${msg.convo_id}`,
                      convo_id: msg.convo_id,
                      from_address: msg.from_address,
                      url: `/app?chat=${encodeURIComponent(msg.convo_id)}`
                    });
                    
                    ws.send(JSON.stringify({
                      type: 'msg:queued',
                      message_id: msg.id,
                      convo_id: msg.convo_id
                    } as WSMessage));
                  }).catch(console.error);
                }
              }
            } else {
              const dmConvo = messageStore.getOrCreateDirectConversation(msg.from_address, msg.to_address);
              msg.convo_id = dmConvo.id;
              messageStore.addMessage(msg);
              messageStore.updateConversationLastMessage(dmConvo.id, msg);
              
              const recipientConnection = getConnection(msg.to_address);
              if (recipientConnection) {
                broadcastToAddress(msg.to_address, {
                  type: 'msg:incoming',
                  message: msg,
                  from_pubkey: signedMsg.from_pubkey
                });
                
                ws.send(JSON.stringify({
                  type: 'convo:create',
                  convo: dmConvo
                } as WSMessage));
                broadcastToAddress(msg.to_address, {
                  type: 'convo:create',
                  convo: dmConvo
                });
                
                msg.status = 'delivered';
                messageStore.updateMessageStatus(msg.id, 'delivered');
                ws.send(JSON.stringify({
                  type: 'msg:delivered',
                  message_id: msg.id,
                  convo_id: msg.convo_id,
                  delivered_at: Date.now()
                } as WSMessage));
              } else {
                // Recipient offline - store message for later delivery and send push notification
                storage.storeMessage(
                  msg.from_address,
                  msg.to_address,
                  dmConvo.id,
                  msg.content,
                  msg.type,
                  undefined
                ).then(async () => {
                  console.log(`Stored message for offline delivery to ${msg.to_address}`);
                  
                  // Send push notification to alert the offline recipient
                  const senderIdentity = await storage.getIdentity(msg.from_address);
                  const senderContact = await storage.getContact(msg.to_address, msg.from_address);
                  const senderName = senderContact?.name || senderIdentity?.displayName || msg.from_address.slice(5, 15) + '...';
                  
                  const messagePreview = msg.type === 'text' 
                    ? (msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content)
                    : msg.type === 'voice' ? 'Voice message'
                    : msg.type === 'video' ? 'Video message'
                    : msg.type === 'image' ? 'Photo'
                    : 'New message';
                  
                  await sendPushNotification(msg.to_address, {
                    type: 'message',
                    title: senderName,
                    body: messagePreview,
                    tag: `msg-${dmConvo.id}`,
                    convo_id: dmConvo.id,
                    from_address: msg.from_address,
                    url: `/app?chat=${encodeURIComponent(dmConvo.id)}`
                  });
                  
                  // Still send convo:create to sender
                  ws.send(JSON.stringify({
                    type: 'convo:create',
                    convo: dmConvo
                  } as WSMessage));
                  ws.send(JSON.stringify({
                    type: 'msg:queued',
                    message_id: msg.id,
                    convo_id: msg.convo_id
                  } as WSMessage));
                }).catch(console.error);
              }
            }
            
            console.log(`Message sent from ${msg.from_address} in convo ${msg.convo_id}`);
            break;
          }

          case 'msg:read': {
            const { message_ids, convo_id, reader_address } = message;
            const convo = messageStore.getConversation(convo_id);
            if (convo) {
              for (const msgId of message_ids) {
                messageStore.updateMessageStatus(msgId, 'read');
              }
              
              const read_at = Date.now();
              for (const participantAddr of convo.participant_addresses) {
                if (participantAddr !== reader_address) {
                  broadcastToAddress(participantAddr, {
                      type: 'msg:read',
                      message_ids,
                      convo_id,
                      reader_address,
                      read_at
                    });
                }
              }
            }
            break;
          }

          case 'msg:typing': {
            const { convo_id, from_address, is_typing } = message;
            const convo = messageStore.getConversation(convo_id);
            if (convo) {
              for (const participantAddr of convo.participant_addresses) {
                if (participantAddr !== from_address) {
                  broadcastToAddress(participantAddr, {
                      type: 'msg:typing',
                      convo_id,
                      from_address,
                      is_typing
                    });
                }
              }
            }
            break;
          }

          case 'msg:reaction': {
            const { message_id, convo_id, emoji, from_address } = message;
            
            if (clientAddress !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address mismatch' } as WSMessage));
              return;
            }
            
            const convo = messageStore.getConversation(convo_id);
            if (!convo || !convo.participant_addresses.includes(from_address)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not a participant' } as WSMessage));
              return;
            }
            
            for (const participantAddr of convo.participant_addresses) {
              if (participantAddr !== from_address) {
                broadcastToAddress(participantAddr, {
                    type: 'msg:reaction',
                    message_id,
                    convo_id,
                    emoji,
                    from_address
                  });
              }
            }
            break;
          }

          case 'msg:unsend': {
            const { message_id, convo_id, from_address } = message;
            
            if (clientAddress !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address mismatch' } as WSMessage));
              return;
            }
            
            const msgToDelete = messageStore.getMessage(message_id);
            if (!msgToDelete) {
              ws.send(JSON.stringify({ type: 'error', message: 'Message not found' } as WSMessage));
              return;
            }
            
            if (msgToDelete.from_address !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Cannot unsend messages you did not send' } as WSMessage));
              return;
            }
            
            const convo = messageStore.getConversation(convo_id);
            if (!convo || !convo.participant_addresses.includes(from_address)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not a participant' } as WSMessage));
              return;
            }
            
            const deleted = messageStore.deleteMessage(message_id, convo_id);
            if (deleted) {
              storage.deleteMessage(message_id).catch(console.error);
              
              for (const participantAddr of convo.participant_addresses) {
                broadcastToAddress(participantAddr, {
                  type: 'msg:unsent',
                  message_id,
                  convo_id
                });
              }
            }
            break;
          }

          case 'msg:edit': {
            const { message_id, convo_id, from_address, new_content } = message;
            
            if (clientAddress !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address mismatch' } as WSMessage));
              return;
            }
            
            const msgToEdit = messageStore.getMessage(message_id);
            if (!msgToEdit) {
              ws.send(JSON.stringify({ type: 'error', message: 'Message not found' } as WSMessage));
              return;
            }
            
            if (msgToEdit.from_address !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Cannot edit messages you did not send' } as WSMessage));
              return;
            }
            
            if (msgToEdit.type !== 'text') {
              ws.send(JSON.stringify({ type: 'error', message: 'Can only edit text messages' } as WSMessage));
              return;
            }
            
            const convo = messageStore.getConversation(convo_id);
            if (!convo || !convo.participant_addresses.includes(from_address)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not a participant' } as WSMessage));
              return;
            }
            
            const { success, edited_at } = messageStore.updateMessageContent(message_id, new_content);
            if (success) {
              storage.updateMessageContent(message_id, new_content).catch(console.error);
              
              for (const participantAddr of convo.participant_addresses) {
                broadcastToAddress(participantAddr, {
                  type: 'msg:edited',
                  message_id,
                  convo_id,
                  new_content,
                  edited_at
                });
              }
            }
            break;
          }

          case 'group:create': {
            const { data, signature, from_pubkey, from_address, nonce, timestamp } = message;
            
            const now = Date.now();
            const timeDiff = Math.abs(now - timestamp);
            if (timeDiff > MAX_CLOCK_SKEW) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid timestamp' } as WSMessage));
              return;
            }
            
            if (recentNonces.has(nonce)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Nonce already used' } as WSMessage));
              return;
            }
            
            const payload = { ...data, from_address, nonce, timestamp };
            const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
            const msgBytes = new TextEncoder().encode(sortedPayload);
            const sigBytes = bs58.decode(signature);
            const pubKeyBytes = bs58.decode(from_pubkey);
            
            if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            recentNonces.set(nonce, timestamp);
            
            const group = messageStore.createGroup(data.name, from_address, data.participant_addresses, data.icon);
            
            for (const addr of group.participant_addresses) {
              broadcastToAddress(addr, {
                  type: 'group:created',
                  convo: group
                });
            }
            
            console.log(`Group created: ${group.name} by ${from_address}`);
            break;
          }

          case 'group:leave': {
            const { group_id, from_address: leaverAddress } = message;
            if (clientAddress !== leaverAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address mismatch' } as WSMessage));
              return;
            }
            
            const group = messageStore.getConversation(group_id);
            if (!group || group.type !== 'group') {
              ws.send(JSON.stringify({ type: 'error', message: 'Group not found' } as WSMessage));
              return;
            }
            
            const members = [...group.participant_addresses];
            messageStore.removeGroupMember(group_id, leaverAddress);
            
            for (const addr of members) {
              broadcastToAddress(addr, {
                  type: 'group:member_left',
                  group_id,
                  member_address: leaverAddress
                });
            }
            
            console.log(`Member ${leaverAddress} left group ${group_id}`);
            break;
          }

          case 'group:remove_member': {
            const { group_id, member_address, from_address: adminAddress } = message;
            if (clientAddress !== adminAddress) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address mismatch' } as WSMessage));
              return;
            }
            
            if (!messageStore.isGroupAdmin(group_id, adminAddress)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not an admin' } as WSMessage));
              return;
            }
            
            const group = messageStore.getConversation(group_id);
            if (!group) {
              ws.send(JSON.stringify({ type: 'error', message: 'Group not found' } as WSMessage));
              return;
            }
            
            const members = [...group.participant_addresses];
            messageStore.removeGroupMember(group_id, member_address);
            
            for (const addr of members) {
              broadcastToAddress(addr, {
                  type: 'group:member_left',
                  group_id,
                  member_address
                });
            }
            
            console.log(`Member ${member_address} removed from group ${group_id} by admin ${adminAddress}`);
            break;
          }

          case 'policy:get': {
            const { address } = message;
            const policy = policyStore.getPolicy(address);
            ws.send(JSON.stringify({
              type: 'policy:response',
              policy
            } as WSMessage));
            break;
          }
          
          case 'policy:update': {
            const { policy, signature, from_pubkey, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ policy, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.savePolicy(policy);
            ws.send(JSON.stringify({
              type: 'policy:updated',
              policy
            } as WSMessage));
            console.log(`Policy updated for ${policy.owner_address}`);
            break;
          }
          
          case 'override:update': {
            const { override, signature, from_pubkey, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ override, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.saveOverride(override);
            ws.send(JSON.stringify({
              type: 'override:updated',
              override
            } as WSMessage));
            console.log(`Override updated for ${override.owner_address} -> ${override.contact_address}`);
            break;
          }
          
          case 'pass:create': {
            const { pass, signature, from_pubkey, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ pass, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            const createdPass = policyStore.createPass(pass);
            ws.send(JSON.stringify({
              type: 'pass:created',
              pass: createdPass
            } as WSMessage));
            console.log(`Pass created: ${createdPass.id} by ${pass.created_by}`);
            break;
          }
          
          case 'pass:revoke': {
            const { pass_id, signature, from_pubkey, from_address, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ pass_id, from_address, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            const pass = policyStore.getPass(pass_id);
            if (!pass || pass.created_by !== from_address) {
              ws.send(JSON.stringify({ type: 'error', message: 'Pass not found or not authorized' } as WSMessage));
              return;
            }
            
            policyStore.revokePass(pass_id);
            ws.send(JSON.stringify({
              type: 'pass:revoked',
              pass_id
            } as WSMessage));
            console.log(`Pass revoked: ${pass_id}`);
            break;
          }
          
          case 'pass:list': {
            const { address } = message;
            const passes = policyStore.getPassesCreatedBy(address);
            ws.send(JSON.stringify({
              type: 'pass:list_response',
              passes
            } as WSMessage));
            break;
          }
          
          case 'block:add': {
            const { blocked, signature, from_pubkey, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ blocked, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.addToBlocklist(blocked);
            ws.send(JSON.stringify({
              type: 'block:added',
              blocked
            } as WSMessage));
            console.log(`Blocked: ${blocked.blocked_address} by ${blocked.owner_address}`);
            break;
          }
          
          case 'block:remove': {
            const { blocked_address, signature, from_pubkey, from_address, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ blocked_address, from_address, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.removeFromBlocklist(from_address, blocked_address);
            ws.send(JSON.stringify({
              type: 'block:removed',
              blocked_address
            } as WSMessage));
            console.log(`Unblocked: ${blocked_address} by ${from_address}`);
            break;
          }
          
          case 'block:list': {
            const { address } = message;
            const blocked = policyStore.getBlocklist(address);
            ws.send(JSON.stringify({
              type: 'block:list_response',
              blocked
            } as WSMessage));
            break;
          }
          
          case 'routing:update': {
            const { rules, signature, from_pubkey, from_address, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ rules, from_address, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.saveRoutingRules(from_address, rules);
            ws.send(JSON.stringify({
              type: 'routing:updated',
              rules
            } as WSMessage));
            console.log(`Routing rules updated for ${from_address}`);
            break;
          }
          
          case 'wallet:verify': {
            const { verification, signature, from_pubkey, nonce, timestamp } = message;
            
            if (!verifyGenericSignature({ verification, nonce, timestamp }, signature, from_pubkey, nonce, timestamp)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature' } as WSMessage));
              return;
            }
            
            policyStore.saveWalletVerification(verification);
            ws.send(JSON.stringify({
              type: 'wallet:verified',
              verification
            } as WSMessage));
            console.log(`Wallet verified: ${verification.wallet_address} for ${verification.call_address}`);
            break;
          }
          
          case 'wallet:get': {
            const { address } = message;
            const verification = policyStore.getWalletVerification(address);
            ws.send(JSON.stringify({
              type: 'wallet:response',
              verification
            } as WSMessage));
            break;
          }
          
          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' } as WSMessage));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' } as WSMessage));
      }
    });

    ws.on('close', () => {
      if (clientAddress) {
        const connectionId = (ws as any).__connectionId;
        if (connectionId) {
          removeConnection(clientAddress, connectionId);
        }
        console.log(`Client disconnected: ${clientAddress}`);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log('WebSocket server initialized on /ws');
  return httpServer;
}
