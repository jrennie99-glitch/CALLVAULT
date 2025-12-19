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
