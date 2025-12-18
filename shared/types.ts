export interface CryptoIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  address: string;
  publicKeyBase58: string;
}

export interface CallIntent {
  from_pubkey: string;
  from_address: string;
  to_address: string;
  timestamp: number;
  nonce: string;
  media: {
    audio: boolean;
    video: boolean;
  };
}

export interface SignedCallIntent {
  intent: CallIntent;
  signature: string;
}

// Message types
export type MessageType = 'text' | 'image' | 'file' | 'voice';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  convo_id: string;
  from_address: string;
  to_address: string;
  timestamp: number;
  type: MessageType;
  content: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_size?: number;
  reply_to?: string;
  nonce: string;
  status?: MessageStatus;
}

export interface SignedMessage {
  message: Message;
  signature: string;
  from_pubkey: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participant_addresses: string[];
  name?: string;
  icon?: string;
  created_at: number;
  created_by: string;
  admin_addresses?: string[];
  last_message?: Message;
  unread_count?: number;
}

export interface GroupInvite {
  group_id: string;
  inviter_address: string;
  invitee_address: string;
  timestamp: number;
  nonce: string;
}

export interface SignedGroupInvite {
  invite: GroupInvite;
  signature: string;
  from_pubkey: string;
}

export type WSMessage =
  | { type: 'register'; address: string }
  | { type: 'call:init'; data: SignedCallIntent }
  | { type: 'call:incoming'; from_address: string; from_pubkey: string; media: { audio: boolean; video: boolean } }
  | { type: 'call:accept'; to_address: string }
  | { type: 'call:reject'; to_address: string }
  | { type: 'call:end'; to_address: string }
  | { type: 'webrtc:offer'; to_address: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc:answer'; to_address: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc:ice'; to_address: string; candidate: RTCIceCandidateInit }
  // Messaging
  | { type: 'msg:send'; data: SignedMessage }
  | { type: 'msg:incoming'; message: Message; from_pubkey: string }
  | { type: 'msg:delivered'; message_id: string; convo_id: string }
  | { type: 'msg:read'; message_ids: string[]; convo_id: string; reader_address: string }
  | { type: 'msg:typing'; convo_id: string; from_address: string; is_typing: boolean }
  // Conversations
  | { type: 'convo:create'; convo: Conversation }
  | { type: 'convo:update'; convo: Conversation }
  // Groups
  | { type: 'group:create'; data: { name: string; participant_addresses: string[]; icon?: string }; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'group:created'; convo: Conversation }
  | { type: 'group:invite'; data: SignedGroupInvite }
  | { type: 'group:invited'; convo: Conversation }
  | { type: 'group:leave'; group_id: string; from_address: string }
  | { type: 'group:member_left'; group_id: string; member_address: string }
  | { type: 'group:remove_member'; group_id: string; member_address: string; from_address: string }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };
