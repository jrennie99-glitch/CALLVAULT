import type { Message, SignedMessage } from '@shared/types';
import { saveLocalMessage, updateLocalMessageStatus } from './messageStorage';

const QUEUE_KEY = 'cv_message_queue';
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

interface QueuedMessage {
  message: Message;
  signedMessage: SignedMessage;
  retryCount: number;
  lastAttempt: number;
  idempotencyKey: string;
}

let messageQueue: QueuedMessage[] = [];
let isProcessing = false;
let currentWs: WebSocket | null = null;

export function loadQueue(): void {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (stored) {
      messageQueue = JSON.parse(stored);
    }
  } catch (e) {
    console.error('[MessageQueue] Failed to load queue:', e);
    messageQueue = [];
  }
}

function saveQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(messageQueue));
  } catch (e) {
    console.error('[MessageQueue] Failed to save queue:', e);
  }
}

export function setWebSocket(ws: WebSocket | null): void {
  currentWs = ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    processQueue();
  }
}

export function queueMessage(message: Message, signedMessage: SignedMessage): void {
  const idempotencyKey = `${message.id}_${message.nonce}`;
  
  const existing = messageQueue.find(q => q.idempotencyKey === idempotencyKey);
  if (existing) {
    console.log('[MessageQueue] Message already queued:', idempotencyKey);
    return;
  }
  
  messageQueue.push({
    message,
    signedMessage,
    retryCount: 0,
    lastAttempt: 0,
    idempotencyKey
  });
  saveQueue();
  processQueue();
}

export function markMessageSent(messageId: string): void {
  const index = messageQueue.findIndex(q => q.message.id === messageId);
  if (index >= 0) {
    messageQueue.splice(index, 1);
    saveQueue();
  }
}

export function getQueuedMessages(): QueuedMessage[] {
  return [...messageQueue];
}

export function getQueueLength(): number {
  return messageQueue.length;
}

async function processQueue(): Promise<void> {
  if (isProcessing || !currentWs || currentWs.readyState !== WebSocket.OPEN) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const now = Date.now();
    const toProcess = messageQueue.filter(q => {
      if (q.retryCount >= MAX_RETRIES) {
        updateLocalMessageStatus(q.message.id, 'failed');
        return false;
      }
      const delay = RETRY_DELAYS[Math.min(q.retryCount, RETRY_DELAYS.length - 1)];
      return now - q.lastAttempt >= delay;
    });
    
    for (const queued of toProcess) {
      if (!currentWs || currentWs.readyState !== WebSocket.OPEN) break;
      
      try {
        currentWs.send(JSON.stringify({
          type: 'msg:send',
          data: queued.signedMessage,
          idempotency_key: queued.idempotencyKey
        }));
        
        queued.lastAttempt = Date.now();
        queued.retryCount++;
        saveQueue();
        
        console.log(`[MessageQueue] Sent message ${queued.message.id} (attempt ${queued.retryCount})`);
      } catch (e) {
        console.error('[MessageQueue] Failed to send:', e);
        queued.lastAttempt = Date.now();
        queued.retryCount++;
        saveQueue();
      }
    }
    
    const failed = messageQueue.filter(q => q.retryCount >= MAX_RETRIES);
    for (const f of failed) {
      updateLocalMessageStatus(f.message.id, 'failed');
      f.message.status = 'failed';
      saveLocalMessage(f.message);
    }
    messageQueue = messageQueue.filter(q => q.retryCount < MAX_RETRIES);
    saveQueue();
    
  } finally {
    isProcessing = false;
  }
}

export function startQueueProcessor(): () => void {
  loadQueue();
  const interval = setInterval(() => {
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      processQueue();
    }
  }, 5000);
  
  return () => clearInterval(interval);
}
