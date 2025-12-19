import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";
import type { WSMessage, SignedCallIntent, CallIntent, SignedMessage, Message, Conversation, CallPolicy, ContactOverride, CallPass, BlockedUser, RoutingRule, WalletVerification, CallRequest } from "@shared/types";
import * as messageStore from "./messageStore";
import * as policyStore from "./policyStore";
import { storage } from "./storage";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

interface ClientConnection {
  ws: WebSocket;
  address: string;
}

const connections = new Map<string, ClientConnection>();
const recentNonces = new Map<string, number>();
// Trial nonces are now persisted in database (trialNoncesTable) for replay protection across restarts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const NONCE_EXPIRY = 5 * 60 * 1000;
const TIMESTAMP_FRESHNESS = 60 * 1000;
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 10;

function cleanupExpiredNonces() {
  const now = Date.now();
  for (const [nonce, timestamp] of Array.from(recentNonces.entries())) {
    if (now - timestamp > NONCE_EXPIRY) {
      recentNonces.delete(nonce);
    }
  }
}

setInterval(cleanupExpiredNonces, 30000);

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

function verifySignature(signedIntent: SignedCallIntent): boolean {
  try {
    const { intent, signature } = signedIntent;
    const now = Date.now();
    
    const timeDiff = now - intent.timestamp;
    if (timeDiff < 0 || timeDiff > TIMESTAMP_FRESHNESS) {
      console.log('Timestamp validation failed: timeDiff =', timeDiff);
      return false;
    }
    
    if (recentNonces.has(intent.nonce)) {
      console.log('Nonce already used:', intent.nonce);
      return false;
    }
    
    const sortedIntent = JSON.stringify(intent, Object.keys(intent).sort());
    const message = new TextEncoder().encode(sortedIntent);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(intent.from_pubkey);
    
    const valid = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
    
    if (valid) {
      recentNonces.set(intent.nonce, intent.timestamp);
    }
    
    return valid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

function verifyMessageSignature(signedMessage: SignedMessage): boolean {
  try {
    const { message, signature, from_pubkey } = signedMessage;
    const now = Date.now();
    
    const timeDiff = now - message.timestamp;
    if (timeDiff < 0 || timeDiff > TIMESTAMP_FRESHNESS) {
      console.log('Message timestamp validation failed: timeDiff =', timeDiff);
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
    
    const timeDiff = now - timestamp;
    if (timeDiff < 0 || timeDiff > TIMESTAMP_FRESHNESS) {
      console.log('Generic signature timestamp validation failed: timeDiff =', timeDiff);
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  ensureUploadsDir();
  
  app.get('/api/turn-config', (_req, res) => {
    const turnUrl = process.env.TURN_URL;
    const turnUser = process.env.TURN_USER;
    const turnPass = process.env.TURN_PASS;

    if (turnUrl && turnUser && turnPass) {
      res.json({
        turnUrl,
        turnUser,
        turnPass
      });
    } else {
      res.json({});
    }
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

  app.get('/api/messages/:convoId', (req, res) => {
    const { convoId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? parseInt(req.query.before as string) : undefined;
    const messages = messageStore.getMessages(convoId, limit, before);
    res.json(messages);
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
      const profile = await storage.createCreatorProfile(req.body);
      res.json(profile);
    } catch (error) {
      console.error('Error creating creator profile:', error);
      res.status(500).json({ error: 'Failed to create creator profile' });
    }
  });

  app.put('/api/creator/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const profile = await storage.updateCreatorProfile(address, req.body);
      res.json(profile);
    } catch (error) {
      console.error('Error updating creator profile:', error);
      res.status(500).json({ error: 'Failed to update creator profile' });
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
      const entry = await storage.addToCallQueue(req.body);
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

  // ============================================
  // ADMIN CONSOLE API ROUTES (Phase 6)
  // ============================================

  // Founder seeding on startup
  const FOUNDER_ADDRESS = process.env.FOUNDER_ADDRESS;
  
  async function seedFounder() {
    if (!FOUNDER_ADDRESS) return;
    
    const identity = await storage.getIdentity(FOUNDER_ADDRESS);
    if (identity && identity.role !== 'founder') {
      await storage.updateIdentity(FOUNDER_ADDRESS, { role: 'founder' } as any);
      console.log(`Promoted ${FOUNDER_ADDRESS} to founder role`);
    } else if (!identity) {
      console.log(`Founder address ${FOUNDER_ADDRESS} not found in database yet - will be promoted on first registration`);
    }
  }
  
  seedFounder().catch(console.error);

  // Admin auth middleware
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
    
    if (identity.role !== 'admin' && identity.role !== 'founder') {
      return res.status(403).json({ error: 'Admin access required' });
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
    next();
  }

  async function requireFounder(req: any, res: any, next: any) {
    await requireAdmin(req, res, () => {
      if (req.adminIdentity?.role !== 'founder') {
        return res.status(403).json({ error: 'Founder access required' });
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

  // Update user role (founder only for promoting to admin)
  app.put('/api/admin/users/:address/role', async (req, res) => {
    const actorAddress = req.headers['x-admin-address'] as string;
    const { role } = req.body;
    const { address } = req.params;
    
    // Only founder can assign admin role
    if (role === 'admin') {
      await requireFounder(req, res, async () => {
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
    } else {
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
        return res.json(identity);
      }
      
      // Create new identity
      identity = await storage.createIdentity({
        address,
        publicKeyBase58,
        displayName,
      });
      
      // Check if this is the founder address
      if (FOUNDER_ADDRESS && address === FOUNDER_ADDRESS) {
        identity = await storage.updateIdentity(address, { role: 'founder' } as any) || identity;
        console.log(`New user ${address} promoted to founder role`);
      }
      
      res.json(identity);
    } catch (error) {
      console.error('Error registering identity:', error);
      res.status(500).json({ error: 'Failed to register identity' });
    }
  });

  // Get user entitlements (public)
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
      if (!actorIdentity || (actorIdentity.role !== 'admin' && actorIdentity.role !== 'founder')) {
        return res.status(403).json({ error: 'Admin access required' });
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
      });
    } catch (error) {
      console.error('Error fetching invite link:', error);
      res.status(500).json({ error: 'Failed to fetch invite link' });
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
      
      const result = await storage.redeemInviteLink(code, redeemerAddress);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        success: true, 
        trialDays: result.link?.trialDays,
        trialMinutes: result.link?.trialMinutes,
        grantPlan: result.link?.grantPlan,
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

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    let clientAddress: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'register': {
            const { address } = message;
            clientAddress = address;
            connections.set(address, { ws, address });
            ws.send(JSON.stringify({ type: 'success', message: 'Registered successfully' } as WSMessage));
            console.log(`Client registered: ${address}`);
            break;
          }

          case 'call:init': {
            const { data: signedIntent, pass_id } = message;
            
            if (!checkRateLimit(signedIntent.intent.from_address)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' } as WSMessage));
              return;
            }
            
            if (!verifySignature(signedIntent)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid signature or expired timestamp' } as WSMessage));
              return;
            }
            
            const senderConnection = connections.get(signedIntent.intent.from_address);
            if (!senderConnection || senderConnection.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address spoofing detected' } as WSMessage));
              return;
            }
            
            const targetConnection = connections.get(signedIntent.intent.to_address);
            if (!targetConnection) {
              ws.send(JSON.stringify({ type: 'error', message: 'Recipient not connected' } as WSMessage));
              return;
            }
            
            const recipientAddress = signedIntent.intent.to_address;
            const callerAddress = signedIntent.intent.from_address;
            
            const recipientContacts = policyStore.getBlocklist(recipientAddress);
            const isContact = false;
            
            policyStore.recordCallAttempt(recipientAddress, callerAddress);
            
            const decision = policyStore.evaluateCallPolicy(
              recipientAddress,
              callerAddress,
              isContact,
              pass_id
            );
            
            switch (decision.action) {
              case 'block':
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
              
              case 'ring':
                if (pass_id) {
                  policyStore.consumePass(pass_id);
                }
                
                targetConnection.ws.send(JSON.stringify({
                  type: 'call:incoming',
                  from_address: callerAddress,
                  from_pubkey: signedIntent.intent.from_pubkey,
                  media: signedIntent.intent.media,
                  is_unknown: decision.is_unknown
                } as WSMessage));
                
                console.log(`Call initiated from ${callerAddress} to ${recipientAddress}`);
                break;
            }
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
            
            const callerConnection = connections.get(request.from_address);
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

          case 'call:accept':
          case 'call:reject':
          case 'call:end': {
            const targetConnection = connections.get(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            break;
          }

          case 'webrtc:offer':
          case 'webrtc:answer':
          case 'webrtc:ice': {
            const targetConnection = connections.get(message.to_address);
            if (targetConnection) {
              targetConnection.ws.send(JSON.stringify(message));
            }
            break;
          }

          case 'msg:send': {
            const { data: signedMsg } = message;
            
            if (!verifyMessageSignature(signedMsg)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid message signature' } as WSMessage));
              return;
            }
            
            const senderConnection = connections.get(signedMsg.message.from_address);
            if (!senderConnection || senderConnection.ws !== ws) {
              ws.send(JSON.stringify({ type: 'error', message: 'Address spoofing detected' } as WSMessage));
              return;
            }
            
            const msg = signedMsg.message;
            msg.status = 'sent';
            
            const convo = messageStore.getConversation(msg.convo_id);
            if (convo) {
              messageStore.addMessage(msg);
              messageStore.updateConversationLastMessage(msg.convo_id, msg);
              
              const recipients = convo.participant_addresses.filter(a => a !== msg.from_address);
              for (const recipientAddr of recipients) {
                const recipientConnection = connections.get(recipientAddr);
                if (recipientConnection) {
                  recipientConnection.ws.send(JSON.stringify({
                    type: 'msg:incoming',
                    message: msg,
                    from_pubkey: signedMsg.from_pubkey
                  } as WSMessage));
                  
                  msg.status = 'delivered';
                  messageStore.updateMessageStatus(msg.id, 'delivered');
                  ws.send(JSON.stringify({
                    type: 'msg:delivered',
                    message_id: msg.id,
                    convo_id: msg.convo_id
                  } as WSMessage));
                }
              }
            } else {
              const dmConvo = messageStore.getOrCreateDirectConversation(msg.from_address, msg.to_address);
              msg.convo_id = dmConvo.id;
              messageStore.addMessage(msg);
              messageStore.updateConversationLastMessage(dmConvo.id, msg);
              
              const recipientConnection = connections.get(msg.to_address);
              if (recipientConnection) {
                recipientConnection.ws.send(JSON.stringify({
                  type: 'msg:incoming',
                  message: msg,
                  from_pubkey: signedMsg.from_pubkey
                } as WSMessage));
                
                ws.send(JSON.stringify({
                  type: 'convo:create',
                  convo: dmConvo
                } as WSMessage));
                recipientConnection.ws.send(JSON.stringify({
                  type: 'convo:create',
                  convo: dmConvo
                } as WSMessage));
                
                msg.status = 'delivered';
                messageStore.updateMessageStatus(msg.id, 'delivered');
                ws.send(JSON.stringify({
                  type: 'msg:delivered',
                  message_id: msg.id,
                  convo_id: msg.convo_id
                } as WSMessage));
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
              
              for (const participantAddr of convo.participant_addresses) {
                if (participantAddr !== reader_address) {
                  const conn = connections.get(participantAddr);
                  if (conn) {
                    conn.ws.send(JSON.stringify({
                      type: 'msg:read',
                      message_ids,
                      convo_id,
                      reader_address
                    } as WSMessage));
                  }
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
                  const conn = connections.get(participantAddr);
                  if (conn) {
                    conn.ws.send(JSON.stringify({
                      type: 'msg:typing',
                      convo_id,
                      from_address,
                      is_typing
                    } as WSMessage));
                  }
                }
              }
            }
            break;
          }

          case 'group:create': {
            const { data, signature, from_pubkey, from_address, nonce, timestamp } = message;
            
            const now = Date.now();
            const timeDiff = now - timestamp;
            if (timeDiff < 0 || timeDiff > TIMESTAMP_FRESHNESS) {
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
              const conn = connections.get(addr);
              if (conn) {
                conn.ws.send(JSON.stringify({
                  type: 'group:created',
                  convo: group
                } as WSMessage));
              }
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
              const conn = connections.get(addr);
              if (conn) {
                conn.ws.send(JSON.stringify({
                  type: 'group:member_left',
                  group_id,
                  member_address: leaverAddress
                } as WSMessage));
              }
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
              const conn = connections.get(addr);
              if (conn) {
                conn.ws.send(JSON.stringify({
                  type: 'group:member_left',
                  group_id,
                  member_address
                } as WSMessage));
              }
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
        connections.delete(clientAddress);
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
