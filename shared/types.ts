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

// Phase 3: Call Access Policy Types
export type AllowCallsFrom = 'contacts' | 'anyone' | 'invite_only';
export type UnknownCallerBehavior = 'block' | 'request' | 'ring_unknown';
export type ContactCallPermission = 'always' | 'scheduled' | 'one_time' | 'blocked';

export interface CallPolicy {
  owner_address: string;
  allow_calls_from: AllowCallsFrom;
  unknown_caller_behavior: UnknownCallerBehavior;
  max_rings_per_sender: number;
  ring_window_minutes: number;
  auto_block_after_rejections: number;
  updated_at: number;
}

export interface ContactOverride {
  owner_address: string;
  contact_address: string;
  permission: ContactCallPermission;
  scheduled_hours?: { start: number; end: number };
  one_time_used?: boolean;
  updated_at: number;
}

// Phase 3: Call Pass Types
export type PassType = 'one_time' | 'expiring' | 'limited';

export interface CallPass {
  id: string;
  recipient_address: string;
  created_by: string;
  pass_type: PassType;
  uses_remaining?: number;
  max_uses?: number;
  expires_at?: number;
  created_at: number;
  burned: boolean;
  revoked: boolean;
}

// Phase 3: Blocklist
export interface BlockedUser {
  owner_address: string;
  blocked_address: string;
  reason?: string;
  reported_spam?: boolean;
  blocked_at: number;
}

// Phase 3: Smart Routing Rules
export type RoutingTrigger = 'unknown_caller' | 'missed_call' | 'after_hours' | 'busy';

export interface RoutingRule {
  id: string;
  owner_address: string;
  trigger: RoutingTrigger;
  enabled: boolean;
  auto_message?: string;
  business_hours?: { start: number; end: number };
}

// Phase 3: Wallet Verification
export interface WalletVerification {
  call_address: string;
  wallet_address: string;
  wallet_type: 'ethereum' | 'solana';
  signature: string;
  verified_at: number;
}

// Phase 3: AI Guardian Settings
export interface AIGuardianSettings {
  enabled: boolean;
  transcription_enabled: boolean;
  custom_api_key?: string;
}

// Phase 3: Call Request (instead of ringing)
export interface CallRequest {
  id: string;
  from_address: string;
  to_address: string;
  is_video: boolean;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export type WSMessage =
  | { type: 'register'; address: string }
  | { type: 'call:init'; data: SignedCallIntent; pass_id?: string }
  | { type: 'call:incoming'; from_address: string; from_pubkey: string; media: { audio: boolean; video: boolean }; is_unknown?: boolean }
  | { type: 'call:accept'; to_address: string }
  | { type: 'call:reject'; to_address: string }
  | { type: 'call:end'; to_address: string }
  | { type: 'call:blocked'; reason: string }
  | { type: 'call:request'; request: CallRequest }
  | { type: 'call:request_response'; request_id: string; accepted: boolean }
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
  // Phase 3: Policies
  | { type: 'policy:update'; policy: CallPolicy; signature: string; from_pubkey: string; nonce: string; timestamp: number }
  | { type: 'policy:updated'; policy: CallPolicy }
  | { type: 'policy:get'; address: string }
  | { type: 'policy:response'; policy: CallPolicy | null }
  // Phase 3: Contact Overrides
  | { type: 'override:update'; override: ContactOverride; signature: string; from_pubkey: string; nonce: string; timestamp: number }
  | { type: 'override:updated'; override: ContactOverride }
  // Phase 3: Call Passes
  | { type: 'pass:create'; pass: Omit<CallPass, 'id' | 'created_at' | 'burned' | 'revoked'>; signature: string; from_pubkey: string; nonce: string; timestamp: number }
  | { type: 'pass:created'; pass: CallPass }
  | { type: 'pass:revoke'; pass_id: string; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'pass:revoked'; pass_id: string }
  | { type: 'pass:list'; address: string }
  | { type: 'pass:list_response'; passes: CallPass[] }
  // Phase 3: Blocklist
  | { type: 'block:add'; blocked: BlockedUser; signature: string; from_pubkey: string; nonce: string; timestamp: number }
  | { type: 'block:added'; blocked: BlockedUser }
  | { type: 'block:remove'; blocked_address: string; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'block:removed'; blocked_address: string }
  | { type: 'block:list'; address: string }
  | { type: 'block:list_response'; blocked: BlockedUser[] }
  // Phase 3: Routing Rules
  | { type: 'routing:update'; rules: RoutingRule[]; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'routing:updated'; rules: RoutingRule[] }
  // Phase 3: Wallet Verification
  | { type: 'wallet:verify'; verification: WalletVerification; signature: string; from_pubkey: string; nonce: string; timestamp: number }
  | { type: 'wallet:verified'; verification: WalletVerification }
  | { type: 'wallet:get'; address: string }
  | { type: 'wallet:response'; verification: WalletVerification | null }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string }
  // Phase 4: Monetization
  | { type: 'queue:join'; request: CallRequest; position: number }
  | { type: 'queue:update'; position: number; estimated_wait: number }
  | { type: 'queue:ready'; request_id: string }
  | { type: 'payment:required'; recipient_address: string; pricing: CallPricing }
  | { type: 'payment:verified'; token_id: string };

// Phase 4: Creator/Business Mode
export type BusinessCategory = 'consulting' | 'tech' | 'music' | 'legal' | 'coaching' | 'health' | 'education' | 'creative' | 'other';

export interface CreatorProfile {
  address: string;
  enabled: boolean;
  display_name: string;
  bio: string;
  category: BusinessCategory;
  timezone: string;
  handle?: string;
  avatar_url?: string;
  wallet_verified?: boolean;
  created_at: number;
  updated_at: number;
}

// Phase 4: Business Hours
export interface BusinessHoursSlot {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  enabled: boolean;
  start: string; // "09:00"
  end: string;   // "17:00"
}

export type AfterHoursBehavior = 'message' | 'paid_only' | 'block_request';

export interface BusinessHours {
  owner_address: string;
  slots: BusinessHoursSlot[];
  after_hours_behavior: AfterHoursBehavior;
  after_hours_message: string;
  updated_at: number;
}

// Phase 4: Paid Calls
export type PricingMode = 'per_session' | 'per_minute';

export interface CallPricing {
  owner_address: string;
  enabled: boolean;
  mode: PricingMode;
  session_price_cents?: number;
  session_duration_minutes?: number;
  per_minute_price_cents?: number;
  minimum_minutes?: number;
  currency: string;
  free_first_call: boolean;
  friends_family_addresses: string[];
  updated_at: number;
}

// Phase 4: Paid Call Links / Tokens
export type PaidLinkType = 'single_use' | 'multi_use';

export interface PaidCallToken {
  id: string;
  recipient_address: string;
  caller_address?: string; // null = anyone with link
  pricing_snapshot: {
    mode: PricingMode;
    amount_cents: number;
    duration_minutes?: number;
  };
  link_type: PaidLinkType;
  uses_remaining?: number;
  expires_at: number;
  payment_id?: string;
  payment_status: 'pending' | 'completed' | 'failed';
  created_at: number;
  burned: boolean;
}

// Phase 4: Call Queue
export interface QueueEntry {
  id: string;
  caller_address: string;
  recipient_address: string;
  position: number;
  is_paid: boolean;
  token_id?: string;
  is_video: boolean;
  reason?: string;
  joined_at: number;
  estimated_wait_minutes: number;
}

// Phase 4: Call Screener
export interface CallScreeningRequest {
  id: string;
  caller_address: string;
  recipient_address: string;
  reason: string;
  is_video: boolean;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
}
