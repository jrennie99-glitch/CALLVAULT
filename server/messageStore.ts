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
}

let store: MessageStore = {
  messages: {},
  conversations: []
};

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

export function addMessage(message: Message): void {
  if (!store.messages[message.convo_id]) {
    store.messages[message.convo_id] = [];
  }
  store.messages[message.convo_id].push(message);
  saveMessages();
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
  const convo: Conversation = {
    id,
    type: 'group',
    participant_addresses: [...new Set([creatorAddress, ...participants])],
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
