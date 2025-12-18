import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import type { WSMessage, SignedCallIntent, CallIntent } from "@shared/types";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
