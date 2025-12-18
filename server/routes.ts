import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";
import type { WSMessage, SignedCallIntent, CallIntent, SignedMessage, Message, Conversation } from "@shared/types";
import * as messageStore from "./messageStore";

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
            const { data: signedIntent } = message;
            
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
            
            targetConnection.ws.send(JSON.stringify({
              type: 'call:incoming',
              from_address: signedIntent.intent.from_address,
              from_pubkey: signedIntent.intent.from_pubkey,
              media: signedIntent.intent.media
            } as WSMessage));
            
            console.log(`Call initiated from ${signedIntent.intent.from_address} to ${signedIntent.intent.to_address}`);
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
