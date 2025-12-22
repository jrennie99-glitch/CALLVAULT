import type { Message, Conversation, MessageStatus } from '@shared/types';

const MESSAGES_KEY = 'crypto_call_messages';
const CONVERSATIONS_KEY = 'crypto_call_conversations';
const PRIVACY_KEY = 'crypto_call_privacy';

export interface PrivacySettings {
  readReceipts: boolean;
  typingIndicators: boolean;
  lastSeen: boolean;
}

export function getPrivacySettings(): PrivacySettings {
  const stored = localStorage.getItem(PRIVACY_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    readReceipts: true,
    typingIndicators: true,
    lastSeen: false
  };
}

export function savePrivacySettings(settings: PrivacySettings): void {
  localStorage.setItem(PRIVACY_KEY, JSON.stringify(settings));
}

export function getLocalMessages(convoId: string): Message[] {
  const stored = localStorage.getItem(MESSAGES_KEY);
  if (!stored) return [];
  const allMessages: Record<string, Message[]> = JSON.parse(stored);
  return allMessages[convoId] || [];
}

export function saveLocalMessage(message: Message): void {
  const stored = localStorage.getItem(MESSAGES_KEY);
  const allMessages: Record<string, Message[]> = stored ? JSON.parse(stored) : {};
  if (!allMessages[message.convo_id]) {
    allMessages[message.convo_id] = [];
  }
  const existing = allMessages[message.convo_id].findIndex(m => m.id === message.id);
  if (existing >= 0) {
    allMessages[message.convo_id][existing] = message;
  } else {
    allMessages[message.convo_id].push(message);
  }
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
}

export function updateLocalMessageStatus(messageId: string, status: MessageStatus): void {
  const stored = localStorage.getItem(MESSAGES_KEY);
  if (!stored) return;
  const allMessages: Record<string, Message[]> = JSON.parse(stored);
  for (const convoId in allMessages) {
    const msg = allMessages[convoId].find(m => m.id === messageId);
    if (msg) {
      msg.status = status;
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
      return;
    }
  }
}

export function getLocalConversations(): Conversation[] {
  const stored = localStorage.getItem(CONVERSATIONS_KEY);
  if (!stored) return [];
  return JSON.parse(stored);
}

export function saveLocalConversation(convo: Conversation): void {
  const convos = getLocalConversations();
  const existing = convos.findIndex(c => c.id === convo.id);
  if (existing >= 0) {
    convos[existing] = convo;
  } else {
    convos.push(convo);
  }
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convos));
}

export function getLocalConversation(convoId: string): Conversation | undefined {
  return getLocalConversations().find(c => c.id === convoId);
}

function djb2Hash(str: string, seed: number = 5381): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

function generateConvoId(addr1: string, addr2: string): string {
  const sorted = [addr1, addr2].sort();
  const combined = sorted.join('|');
  const h1 = djb2Hash(combined, 5381);
  const h2 = djb2Hash(combined, 33);
  const h3 = djb2Hash(combined, 65599);
  return `dm_${h1.toString(36)}_${h2.toString(36)}_${h3.toString(36)}`;
}

export function getOrCreateDirectConvo(myAddress: string, otherAddress: string): Conversation {
  const convos = getLocalConversations();
  const existing = convos.find(c => 
    c.type === 'direct' &&
    c.participant_addresses.includes(myAddress) &&
    c.participant_addresses.includes(otherAddress)
  );
  if (existing) return existing;
  
  const uniqueId = generateConvoId(myAddress, otherAddress);
  
  const newConvo: Conversation = {
    id: uniqueId,
    type: 'direct',
    participant_addresses: [myAddress, otherAddress],
    created_at: Date.now(),
    created_by: myAddress
  };
  saveLocalConversation(newConvo);
  return newConvo;
}

export function updateConvoLastMessage(convoId: string, message: Message): void {
  const convo = getLocalConversation(convoId);
  if (convo) {
    convo.last_message = message;
    saveLocalConversation(convo);
  }
}

export function incrementUnreadCount(convoId: string): void {
  const convo = getLocalConversation(convoId);
  if (convo) {
    convo.unread_count = (convo.unread_count || 0) + 1;
    saveLocalConversation(convo);
  }
}

export function clearUnreadCount(convoId: string): void {
  const convo = getLocalConversation(convoId);
  if (convo) {
    convo.unread_count = 0;
    saveLocalConversation(convo);
  }
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
