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
export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video' | 'video_message' | 'meme';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageReaction {
  emoji: string;
  from_address: string;
  timestamp: number;
}

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
  attachment_duration?: number;
  attachment_thumbnail?: string;
  transcription?: string;
  reply_to?: string;
  nonce: string;
  status?: MessageStatus;
  reactions?: MessageReaction[];
  seq?: number; // Server-assigned sequence number for ordering
  server_timestamp?: number; // Server timestamp for ordering
  delivered_at?: number; // Timestamp when message was delivered
  read_at?: number; // Timestamp when message was read
  edited_at?: number; // Timestamp when message was edited
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

// Group Call Room
export interface GroupCallRoom {
  id: string;
  room_code: string;
  host_address: string;
  name?: string;
  is_video: boolean;
  is_locked: boolean;
  max_participants: number;
  status: 'active' | 'ended';
  created_at: number;
}

// Group Call Participant
export interface GroupCallParticipant {
  user_address: string;
  display_name?: string;
  is_host: boolean;
  is_muted: boolean;
  is_video_off: boolean;
  joined_at: number;
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
  | { type: 'msg:send'; data: SignedMessage; idempotency_key?: string }
  | { type: 'msg:incoming'; message: Message; from_pubkey: string }
  | { type: 'msg:delivered'; message_id: string; convo_id: string; delivered_at?: number }
  | { type: 'msg:queued'; message_id: string; convo_id: string }
  | { type: 'msg:read'; message_ids: string[]; convo_id: string; reader_address: string; read_at?: number }
  | { type: 'msg:typing'; convo_id: string; from_address: string; is_typing: boolean }
  | { type: 'msg:reaction'; convo_id: string; message_id: string; emoji: string; from_address: string }
  | { type: 'msg:ack'; message_id: string; status: 'duplicate' | 'received' | 'error'; seq?: number; server_timestamp?: number; error?: string }
  | { type: 'msg:unsend'; message_id: string; convo_id: string; from_address: string }
  | { type: 'msg:unsent'; message_id: string; convo_id: string }
  | { type: 'msg:edit'; message_id: string; convo_id: string; from_address: string; new_content: string }
  | { type: 'msg:edited'; message_id: string; convo_id: string; new_content: string; edited_at: number }
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
  // Heartbeat
  | { type: 'ping' }
  | { type: 'pong' }
  // Call connection status messages
  | { type: 'call:connecting'; to_address: string; message: string }
  | { type: 'call:ringing'; to_address: string; message: string }
  // Call unavailable (offline recipient)
  | { type: 'call:unavailable'; to_address: string; reason: string }
  // Do Not Disturb (DND) - caller routed to voicemail
  | { type: 'call:dnd'; to_address: string; reason: string; voicemail_enabled: boolean }
  // Phase 4: Monetization
  | { type: 'queue:join'; request: CallRequest; position: number }
  | { type: 'queue:update'; position: number; estimated_wait: number }
  | { type: 'queue:ready'; request_id: string }
  | { type: 'payment:required'; recipient_address: string; pricing: CallPricing }
  | { type: 'payment:verified'; token_id: string }
  // Call Waiting (phone-like)
  | { type: 'call:waiting'; from_address: string; from_pubkey: string; media: { audio: boolean; video: boolean } }
  | { type: 'call:hold'; to_address: string }
  | { type: 'call:resume'; to_address: string }
  | { type: 'call:held'; by_address: string }
  | { type: 'call:resumed'; by_address: string }
  | { type: 'call:busy_waiting'; to_address: string }
  // Group Calls (room-based mesh WebRTC)
  | { type: 'room:create'; name?: string; is_video: boolean; participant_addresses: string[]; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'room:created'; room: GroupCallRoom }
  | { type: 'room:join'; room_id: string; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'room:joined'; room: GroupCallRoom; participants: GroupCallParticipant[] }
  | { type: 'room:leave'; room_id: string; from_address: string }
  | { type: 'room:left'; room_id: string; user_address: string }
  | { type: 'room:participant_joined'; room_id: string; participant: GroupCallParticipant }
  | { type: 'room:participant_left'; room_id: string; user_address: string }
  | { type: 'room:participants'; room_id: string; participants: GroupCallParticipant[] }
  | { type: 'room:invite'; room_id: string; to_address: string; from_address: string; is_video: boolean }
  | { type: 'room:lock'; room_id: string; locked: boolean }
  | { type: 'room:end'; room_id: string }
  | { type: 'room:ended'; room_id: string }
  | { type: 'room:error'; room_id?: string; message: string; reason?: string }
  // Mesh WebRTC signaling for group calls
  | { type: 'mesh:offer'; room_id: string; to_peer: string; from_peer: string; offer: RTCSessionDescriptionInit }
  | { type: 'mesh:answer'; room_id: string; to_peer: string; from_peer: string; answer: RTCSessionDescriptionInit }
  | { type: 'mesh:ice'; room_id: string; to_peer: string; from_peer: string; candidate: RTCIceCandidateInit }
  // Call Merge (merge 1:1 calls into group)
  | { type: 'call:merge'; call_addresses: string[]; signature: string; from_pubkey: string; from_address: string; nonce: string; timestamp: number }
  | { type: 'call:merged'; room: GroupCallRoom };

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

// Phase 5: User Modes + Feature Flags + Plan Gating
export type UserMode = 'personal' | 'creator' | 'business' | 'stage';

export const USER_MODES: { value: UserMode; label: string; description: string }[] = [
  { value: 'personal', label: 'Personal', description: 'Simple calling and messaging for everyday use' },
  { value: 'creator', label: 'Creator', description: 'Accept paid calls and manage your audience' },
  { value: 'business', label: 'Business', description: 'Multiple lines, routing rules, and delegation' },
  { value: 'stage', label: 'Stage', description: 'Broadcast rooms and large audience calls' },
];

export type FeatureFlag =
  | 'FEATURE_MODE_SWITCHER'
  | 'FEATURE_MULTIPLE_CALL_IDS'
  | 'FEATURE_GROUP_CALLS'
  | 'FEATURE_CALL_WAITING'
  | 'FEATURE_CALL_MERGE'
  | 'FEATURE_ROUTING_RULES'
  | 'FEATURE_DELEGATION'
  | 'FEATURE_STAGE_ROOMS'
  | 'FEATURE_PAID_CALLS'
  | 'FEATURE_RECORDING'
  | 'FEATURE_CALL_SCHEDULING'
  | 'FEATURE_TEAM_MANAGEMENT'
  | 'FEATURE_CUSTOM_BRANDING'
  | 'FEATURE_PRIORITY_SUPPORT'
  | 'FEATURE_PRIORITY_ROUTING'
  | 'FEATURE_AVAILABILITY_CONTROLS';

export interface FeatureFlags {
  FEATURE_MODE_SWITCHER: boolean;
  FEATURE_MULTIPLE_CALL_IDS: boolean;
  FEATURE_GROUP_CALLS: boolean;
  FEATURE_CALL_WAITING: boolean;
  FEATURE_CALL_MERGE: boolean;
  FEATURE_ROUTING_RULES: boolean;
  FEATURE_DELEGATION: boolean;
  FEATURE_STAGE_ROOMS: boolean;
  FEATURE_PAID_CALLS: boolean;
  FEATURE_RECORDING: boolean;
  FEATURE_CALL_SCHEDULING: boolean;
  FEATURE_TEAM_MANAGEMENT: boolean;
  FEATURE_CUSTOM_BRANDING: boolean;
  FEATURE_PRIORITY_SUPPORT: boolean;
  FEATURE_PRIORITY_ROUTING: boolean;
  FEATURE_AVAILABILITY_CONTROLS: boolean;
}

export interface EffectiveEntitlements {
  // User info
  userAddress: string;
  plan: string;
  mode: UserMode;
  
  // Limits
  maxCallIds: number;
  maxGroupParticipants: number;
  maxCallMinutesPerMonth: number | null;
  maxCallsPerDay: number | null;
  maxCallDurationMinutes: number | null;
  
  // Feature access
  allowCallWaiting: boolean;
  allowCallMerge: boolean;
  allowPaidCalls: boolean;
  allowRoutingRules: boolean;
  allowDelegation: boolean;
  allowStageRooms: boolean;
  allowRecording: boolean;
  allowGroupCalls: boolean;
  allowCallScheduling: boolean;
  allowTeamManagement: boolean;
  allowCustomBranding: boolean;
  allowPrioritySupport: boolean;
  allowPriorityRouting: boolean;
  allowAvailabilityControls: boolean;
  
  // Computed feature flags for UI visibility
  flags: FeatureFlags;
  
  // Admin override info
  hasOverrides: boolean;
  overrideExpiresAt?: number;
}

export interface UserModeInfo {
  mode: UserMode;
  availableModes: UserMode[];
  flags: Partial<FeatureFlags>;
}
