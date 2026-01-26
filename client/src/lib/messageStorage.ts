import type { Message, Conversation, MessageStatus } from '@shared/types';
import { generateConversationId } from '@shared/conversationId';

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

/**
 * Helper function to save or update a message in storage
 */
function saveMessageToStorage(message: Message, allMessages: Record<string, Message[]>): void {
  if (!allMessages[message.convo_id]) {
    allMessages[message.convo_id] = [];
  }
  const existing = allMessages[message.convo_id].findIndex(m => m.id === message.id);
  if (existing >= 0) {
    allMessages[message.convo_id][existing] = message;
  } else {
    allMessages[message.convo_id].push(message);
  }
}

export function saveLocalMessage(message: Message): void {
  try {
    const stored = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Record<string, Message[]> = stored ? JSON.parse(stored) : {};
    saveMessageToStorage(message, allMessages);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
  } catch (error: any) {
    // Handle quota exceeded errors
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.error('[MessageStorage] LocalStorage quota exceeded');
      // Try to free up space by removing old messages
      cleanupOldMessages();
      // Try saving again
      try {
        const stored = localStorage.getItem(MESSAGES_KEY);
        const allMessages: Record<string, Message[]> = stored ? JSON.parse(stored) : {};
        saveMessageToStorage(message, allMessages);
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
        console.log('[MessageStorage] Message saved after cleanup');
      } catch (retryError) {
        console.error('[MessageStorage] Failed to save message after cleanup:', retryError);
        throw new Error('STORAGE_QUOTA_EXCEEDED');
      }
    } else {
      console.error('[MessageStorage] Error saving message:', error);
      throw error;
    }
  }
}

/**
 * Clean up old messages to free up localStorage space
 * Keeps only the most recent 100 messages per conversation
 */
function cleanupOldMessages(): void {
  try {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return;
    
    const allMessages: Record<string, Message[]> = JSON.parse(stored);
    const MAX_MESSAGES_PER_CONVO = 100;
    
    // Sort messages by timestamp and keep only recent ones
    for (const convoId in allMessages) {
      const messages = allMessages[convoId];
      if (messages.length > MAX_MESSAGES_PER_CONVO) {
        // Sort by timestamp (newest first)
        messages.sort((a, b) => b.timestamp - a.timestamp);
        // Keep only the most recent messages
        allMessages[convoId] = messages.slice(0, MAX_MESSAGES_PER_CONVO);
      }
    }
    
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    console.log('[MessageStorage] Cleaned up old messages');
  } catch (error) {
    console.error('[MessageStorage] Error during cleanup:', error);
  }
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

export function getOrCreateDirectConvo(myAddress: string, otherAddress: string): Conversation {
  const convos = getLocalConversations();
  const existing = convos.find(c => 
    c.type === 'direct' &&
    c.participant_addresses.includes(myAddress) &&
    c.participant_addresses.includes(otherAddress)
  );
  if (existing) return existing;
  
  const uniqueId = generateConversationId(myAddress, otherAddress);
  
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
