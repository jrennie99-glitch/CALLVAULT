import type { Message, Conversation } from '@shared/types';
import { generateConversationId } from '../shared/conversationId';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

interface MessageStore {
  messages: Record<string, Message[]>;
  conversations: Conversation[];
  seqCounters: Record<string, number>; // Per-conversation sequence counters
}

let store: MessageStore = {
  messages: {},
  conversations: [],
  seqCounters: {}
};

// Get next sequence number for a conversation
function getNextSeq(convoId: string): number {
  if (!store.seqCounters[convoId]) {
    // Initialize from existing messages
    const messages = store.messages[convoId] || [];
    const maxSeq = messages.reduce((max, m) => Math.max(max, m.seq || 0), 0);
    store.seqCounters[convoId] = maxSeq;
  }
  store.seqCounters[convoId]++;
  return store.seqCounters[convoId];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore() {
  ensureDataDir();
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const messagesData = fs.readFileSync(MESSAGES_FILE, 'utf-8');
      store.messages = JSON.parse(messagesData);
    }
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      const convosData = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8');
      store.conversations = JSON.parse(convosData);
    }
  } catch (error) {
    console.error('Error loading message store:', error);
  }
}

function saveMessages() {
  ensureDataDir();
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(store.messages, null, 2));
}

function saveConversations() {
  ensureDataDir();
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(store.conversations, null, 2));
}

loadStore();

export function addMessage(message: Message): Message {
  if (!store.messages[message.convo_id]) {
    store.messages[message.convo_id] = [];
  }
  // Honor pre-assigned seq/server_timestamp from DB if present, otherwise assign locally
  if (!message.seq) {
    message.seq = getNextSeq(message.convo_id);
  } else {
    // Update seq counter to stay in sync with DB
    if (!store.seqCounters[message.convo_id] || message.seq > store.seqCounters[message.convo_id]) {
      store.seqCounters[message.convo_id] = message.seq;
    }
  }
  if (!message.server_timestamp) {
    message.server_timestamp = Date.now();
  }
  store.messages[message.convo_id].push(message);
  saveMessages();
  return message;
}

// Get messages since a specific seq for sync/resume
export function getMessagesSinceSeq(convoId: string, sinceSeq: number, limit = 100): Message[] {
  const convoMessages = store.messages[convoId] || [];
  return convoMessages
    .filter(m => (m.seq || 0) > sinceSeq)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .slice(0, limit);
}

// Get latest seq for a conversation
export function getLatestSeq(convoId: string): number {
  const messages = store.messages[convoId] || [];
  return messages.reduce((max, m) => Math.max(max, m.seq || 0), 0);
}

export function getMessages(convoId: string, limit = 50, before?: number): Message[] {
  const convoMessages = store.messages[convoId] || [];
  let filtered = convoMessages;
  if (before) {
    filtered = convoMessages.filter(m => m.timestamp < before);
  }
  return filtered.slice(-limit);
}

export function getMessage(messageId: string): Message | undefined {
  for (const convoMessages of Object.values(store.messages)) {
    const message = convoMessages.find(m => m.id === messageId);
    if (message) return message;
  }
  return undefined;
}

export function updateMessageStatus(messageId: string, status: Message['status']): void {
  for (const convoMessages of Object.values(store.messages)) {
    const message = convoMessages.find(m => m.id === messageId);
    if (message) {
      message.status = status;
      saveMessages();
      return;
    }
  }
}

export function deleteMessage(messageId: string, convoId: string): boolean {
  const convoMessages = store.messages[convoId];
  if (!convoMessages) return false;
  
  const index = convoMessages.findIndex(m => m.id === messageId);
  if (index === -1) return false;
  
  convoMessages.splice(index, 1);
  saveMessages();
  return true;
}

export function createConversation(convo: Conversation): Conversation {
  const existing = store.conversations.find(c => c.id === convo.id);
  if (existing) return existing;
  store.conversations.push(convo);
  saveConversations();
  return convo;
}

export function getConversation(convoId: string): Conversation | undefined {
  return store.conversations.find(c => c.id === convoId);
}

export function getConversationsForAddress(address: string): Conversation[] {
  return store.conversations.filter(c => 
    c.participant_addresses.includes(address)
  );
}

export function getOrCreateDirectConversation(address1: string, address2: string): Conversation {
  const existing = store.conversations.find(c => 
    c.type === 'direct' &&
    c.participant_addresses.length === 2 &&
    c.participant_addresses.includes(address1) &&
    c.participant_addresses.includes(address2)
  );
  if (existing) return existing;
  
  const uniqueId = generateConversationId(address1, address2);
  
  const convo: Conversation = {
    id: uniqueId,
    type: 'direct',
    participant_addresses: [address1, address2],
    created_at: Date.now(),
    created_by: address1
  };
  store.conversations.push(convo);
  saveConversations();
  return convo;
}

export function updateConversationLastMessage(convoId: string, message: Message): void {
  const convo = store.conversations.find(c => c.id === convoId);
  if (convo) {
    convo.last_message = message;
    saveConversations();
  }
}

export function createGroup(name: string, creatorAddress: string, participants: string[], icon?: string): Conversation {
  const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const uniqueParticipants = Array.from(new Set([creatorAddress, ...participants]));
  const convo: Conversation = {
    id,
    type: 'group',
    participant_addresses: uniqueParticipants,
    name,
    icon,
    created_at: Date.now(),
    created_by: creatorAddress,
    admin_addresses: [creatorAddress]
  };
  store.conversations.push(convo);
  saveConversations();
  return convo;
}

export function addGroupMember(groupId: string, memberAddress: string): boolean {
  const group = store.conversations.find(c => c.id === groupId && c.type === 'group');
  if (!group) return false;
  if (!group.participant_addresses.includes(memberAddress)) {
    group.participant_addresses.push(memberAddress);
    saveConversations();
  }
  return true;
}

export function removeGroupMember(groupId: string, memberAddress: string): boolean {
  const group = store.conversations.find(c => c.id === groupId && c.type === 'group');
  if (!group) return false;
  group.participant_addresses = group.participant_addresses.filter(a => a !== memberAddress);
  if (group.admin_addresses) {
    group.admin_addresses = group.admin_addresses.filter(a => a !== memberAddress);
  }
  saveConversations();
  return true;
}

export function isGroupAdmin(groupId: string, address: string): boolean {
  const group = store.conversations.find(c => c.id === groupId && c.type === 'group');
  return group?.admin_addresses?.includes(address) || false;
}

export function searchMessages(query: string, convoId?: string, limit = 50): Message[] {
  const searchLower = query.toLowerCase().trim();
  if (!searchLower) return [];
  
  const results: Message[] = [];
  const conversationsToSearch = convoId 
    ? { [convoId]: store.messages[convoId] || [] }
    : store.messages;
  
  for (const [, messages] of Object.entries(conversationsToSearch)) {
    for (const msg of messages) {
      if (msg.content && msg.content.toLowerCase().includes(searchLower)) {
        results.push(msg);
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
  }
  
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getMessagesSince(convoId: string, sinceTimestamp: number): Message[] {
  const convoMessages = store.messages[convoId] || [];
  return convoMessages.filter(m => m.timestamp > sinceTimestamp);
}

export function hasMessage(messageId: string, nonce: string): boolean {
  for (const convoMessages of Object.values(store.messages)) {
    if (convoMessages.some(m => m.id === messageId || m.nonce === nonce)) {
      return true;
    }
  }
  return false;
}
