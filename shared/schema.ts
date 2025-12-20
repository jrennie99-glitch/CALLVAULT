import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const cryptoIdentities = pgTable("crypto_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  publicKeyBase58: text("public_key_base58").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  handle: text("handle"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // RBAC fields
  role: text("role").notNull().default("user"), // 'founder' | 'admin' | 'user'
  isDisabled: boolean("is_disabled").default(false),
  lastLoginAt: timestamp("last_login_at"),
  // Plan fields
  plan: text("plan").notNull().default("free"), // 'free' | 'pro' | 'business' | 'enterprise'
  planStatus: text("plan_status").default("none"), // 'none' | 'active' | 'cancelled' | 'past_due'
  planRenewalAt: timestamp("plan_renewal_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Trial fields
  trialStatus: text("trial_status").default("none"), // 'none' | 'active' | 'expired'
  trialStartAt: timestamp("trial_start_at"),
  trialEndAt: timestamp("trial_end_at"),
  trialMinutesRemaining: integer("trial_minutes_remaining"),
  trialPlan: text("trial_plan").default("pro"), // which plan trial grants access to: 'pro' | 'business'
  // Freeze Mode fields
  freezeMode: boolean("freeze_mode").default(false),
  freezeModeSetupCompleted: boolean("freeze_mode_setup_completed").default(false),
  // Comped account (perpetual Pro without billing)
  isComped: boolean("is_comped").default(false),
  // Extended admin fields
  status: text("status").notNull().default("active"), // 'active' | 'suspended' | 'soft_banned' | 'deleted'
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: text("suspended_by"),
  suspendedReason: text("suspended_reason"),
  freeAccessEndAt: timestamp("free_access_end_at"), // For time-limited free access grants
  adminExpiresAt: timestamp("admin_expires_at"), // For time-limited admin roles
});

export const insertCryptoIdentitySchema = createInsertSchema(cryptoIdentities).omit({
  id: true,
  createdAt: true,
});
export type InsertCryptoIdentity = z.infer<typeof insertCryptoIdentitySchema>;
export type CryptoIdentityRecord = typeof cryptoIdentities.$inferSelect;

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerAddress: text("owner_address").notNull(),
  contactAddress: text("contact_address").notNull(),
  name: text("name"),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").default(false),
  alwaysAllowed: boolean("always_allowed").default(false), // Emergency bypass for Freeze Mode
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const callSessions = pgTable("call_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callerAddress: text("caller_address").notNull(),
  calleeAddress: text("callee_address").notNull(),
  callType: text("call_type").notNull(), // 'video' | 'audio'
  status: text("status").notNull(), // 'initiated' | 'ringing' | 'connected' | 'ended' | 'missed' | 'rejected'
  startedAt: timestamp("started_at").defaultNow().notNull(),
  connectedAt: timestamp("connected_at"),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  endReason: text("end_reason"), // 'completed' | 'missed' | 'rejected' | 'failed'
  isPaid: boolean("is_paid").default(false),
  paymentIntentId: text("payment_intent_id"),
  amountPaid: integer("amount_paid"), // in cents
});

export const insertCallSessionSchema = createInsertSchema(callSessions).omit({
  id: true,
  connectedAt: true,
  endedAt: true,
  durationSeconds: true,
});
export type InsertCallSession = z.infer<typeof insertCallSessionSchema>;
export type CallSession = typeof callSessions.$inferSelect;

export const paidCallTokens = pgTable("paid_call_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorAddress: text("creator_address").notNull(),
  callerAddress: text("caller_address"),
  token: text("token").notNull().unique(),
  paymentIntentId: text("payment_intent_id"),
  checkoutSessionId: text("checkout_session_id"),
  status: text("status").notNull().default("pending"), // 'pending' | 'paid' | 'used' | 'expired' | 'refunded'
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  pricingType: text("pricing_type").notNull(), // 'per_session' | 'per_minute'
  callType: text("call_type").notNull(), // 'video' | 'audio'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
});

export const insertPaidCallTokenSchema = createInsertSchema(paidCallTokens).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});
export type InsertPaidCallToken = z.infer<typeof insertPaidCallTokenSchema>;
export type PaidCallToken = typeof paidCallTokens.$inferSelect;

export const callQueueEntries = pgTable("call_queue_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorAddress: text("creator_address").notNull(),
  callerAddress: text("caller_address").notNull(),
  callerName: text("caller_name"),
  callType: text("call_type").notNull(), // 'video' | 'audio'
  position: integer("position").notNull(),
  status: text("status").notNull().default("waiting"), // 'waiting' | 'notified' | 'connected' | 'left' | 'expired'
  isPaid: boolean("is_paid").default(false),
  paidTokenId: text("paid_token_id"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),
});

export const insertCallQueueEntrySchema = createInsertSchema(callQueueEntries).omit({
  id: true,
  joinedAt: true,
  notifiedAt: true,
});
export type InsertCallQueueEntry = z.infer<typeof insertCallQueueEntrySchema>;
export type CallQueueEntry = typeof callQueueEntries.$inferSelect;

export const creatorProfiles = pgTable("creator_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerAddress: text("owner_address").notNull().unique(),
  enabled: boolean("enabled").default(false),
  displayName: text("display_name"),
  bio: text("bio"),
  category: text("category"),
  handle: text("handle").unique(),
  timezone: text("timezone").default("UTC"),
  businessHours: jsonb("business_hours").$type<Record<string, { enabled: boolean; start: string; end: string }>>(),
  afterHoursBehavior: text("after_hours_behavior").default("block"), // 'auto_message' | 'paid_only' | 'block'
  afterHoursMessage: text("after_hours_message"),
  pricingEnabled: boolean("pricing_enabled").default(false),
  sessionPriceCents: integer("session_price_cents"),
  minutePriceCents: integer("minute_price_cents"),
  minimumMinutes: integer("minimum_minutes").default(1),
  freeFirstCall: boolean("free_first_call").default(false),
  friendsAndFamily: text("friends_and_family").array(),
  currency: text("currency").default("usd"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCreatorProfile = z.infer<typeof insertCreatorProfileSchema>;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;

export const callDurationRecords = pgTable("call_duration_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: text("call_session_id").notNull(),
  creatorAddress: text("creator_address").notNull(),
  callerAddress: text("caller_address").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationSeconds: integer("duration_seconds"),
  billableMinutes: integer("billable_minutes"),
  ratePerMinuteCents: integer("rate_per_minute_cents"),
  totalAmountCents: integer("total_amount_cents"),
  isPaid: boolean("is_paid").default(false),
});

export const insertCallDurationRecordSchema = createInsertSchema(callDurationRecords).omit({
  id: true,
  endTime: true,
  durationSeconds: true,
  billableMinutes: true,
  totalAmountCents: true,
});
export type InsertCallDurationRecord = z.infer<typeof insertCallDurationRecordSchema>;
export type CallDurationRecord = typeof callDurationRecords.$inferSelect;

export const creatorEarnings = pgTable("creator_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorAddress: text("creator_address").notNull(),
  period: text("period").notNull(), // 'daily' | 'weekly' | 'monthly' | 'all_time'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end"),
  totalCalls: integer("total_calls").default(0),
  totalMinutes: integer("total_minutes").default(0),
  totalEarningsCents: integer("total_earnings_cents").default(0),
  paidCalls: integer("paid_calls").default(0),
  freeCalls: integer("free_calls").default(0),
});

export const insertCreatorEarningsSchema = createInsertSchema(creatorEarnings).omit({
  id: true,
});
export type InsertCreatorEarnings = z.infer<typeof insertCreatorEarningsSchema>;
export type CreatorEarnings = typeof creatorEarnings.$inferSelect;

export const cryptoIdentitiesRelations = relations(cryptoIdentities, ({ many }) => ({
  contacts: many(contacts),
  callSessions: many(callSessions),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  owner: one(cryptoIdentities, {
    fields: [contacts.ownerAddress],
    references: [cryptoIdentities.address],
  }),
}));

export const callSessionsRelations = relations(callSessions, ({ one }) => ({
  caller: one(cryptoIdentities, {
    fields: [callSessions.callerAddress],
    references: [cryptoIdentities.address],
  }),
  callee: one(cryptoIdentities, {
    fields: [callSessions.calleeAddress],
    references: [cryptoIdentities.address],
  }),
  durationRecord: one(callDurationRecords, {
    fields: [callSessions.id],
    references: [callDurationRecords.callSessionId],
  }),
}));

export const callDurationRecordsRelations = relations(callDurationRecords, ({ one }) => ({
  callSession: one(callSessions, {
    fields: [callDurationRecords.callSessionId],
    references: [callSessions.id],
  }),
}));

// Admin Audit Logs (extended for comprehensive tracking)
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorAddress: text("actor_address").notNull(),
  actorRole: text("actor_role"),
  targetAddress: text("target_address"),
  targetType: text("target_type"), // 'user' | 'admin' | 'system' | 'billing'
  actionType: text("action_type").notNull(),
  category: text("category").notNull().default("admin"), // 'admin' | 'security' | 'billing' | 'system' | 'access'
  severity: text("severity").notNull().default("info"), // 'info' | 'warning' | 'critical'
  beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
  afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  reason: text("reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

// Trial Nonces (for replay protection)
export const trialNoncesTable = pgTable("trial_nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  nonce: text("nonce").notNull(),
  usedAt: timestamp("used_at").defaultNow().notNull(),
}, (table) => ({
  addressNonceUnique: sql`UNIQUE (${table.address}, ${table.nonce})`,
}));

export type TrialNonce = typeof trialNoncesTable.$inferSelect;

// Invite Links (for influencer onboarding)
export const inviteLinks = pgTable("invite_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  createdByAddress: text("created_by_address").notNull(),
  type: text("type").notNull().default("trial"), // 'trial' | 'pro_access' | 'business_access'
  trialDays: integer("trial_days").default(7),
  trialMinutes: integer("trial_minutes").default(30),
  grantPlan: text("grant_plan").default("pro"), // 'pro' | 'business'
  maxUses: integer("max_uses"),
  uses: integer("uses").default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInviteLinkSchema = createInsertSchema(inviteLinks).omit({
  id: true,
  uses: true,
  createdAt: true,
});
export type InsertInviteLink = z.infer<typeof insertInviteLinkSchema>;
export type InviteLink = typeof inviteLinks.$inferSelect;

// Invite Redemptions (track who used which invite)
export const inviteRedemptions = pgTable("invite_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inviteLinkId: text("invite_link_id").notNull(),
  redeemedByAddress: text("redeemed_by_address").notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
});

export type InviteRedemption = typeof inviteRedemptions.$inferSelect;

// Crypto Invoices (for Base chain USDC/ETH payments)
export const cryptoInvoices = pgTable("crypto_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payTokenId: text("pay_token_id").notNull(), // links to paid_call_tokens
  recipientCallId: text("recipient_call_id").notNull(),
  recipientWallet: text("recipient_wallet").notNull(), // EVM address
  payerCallId: text("payer_call_id"),
  chain: text("chain").notNull().default("base"), // 'base' | 'solana'
  asset: text("asset").notNull(), // 'USDC' | 'ETH' | 'SOL'
  amountUsd: real("amount_usd").notNull(),
  amountAsset: text("amount_asset").notNull(), // exact amount in asset decimals
  status: text("status").notNull().default("pending"), // 'pending' | 'paid' | 'expired' | 'failed'
  txHash: text("tx_hash"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

export const insertCryptoInvoiceSchema = createInsertSchema(cryptoInvoices).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});
export type InsertCryptoInvoice = z.infer<typeof insertCryptoInvoiceSchema>;
export type CryptoInvoice = typeof cryptoInvoices.$inferSelect;

// Usage Counters (for Free Tier Cost Shield)
export const usageCounters = pgTable("usage_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAddress: text("user_address").notNull().unique(),
  dayKey: text("day_key").notNull(), // YYYY-MM-DD format
  monthKey: text("month_key").notNull(), // YYYY-MM format
  callsStartedToday: integer("calls_started_today").default(0),
  failedStartsToday: integer("failed_starts_today").default(0),
  callAttemptsHour: integer("call_attempts_hour").default(0),
  lastAttemptHour: integer("last_attempt_hour"), // hour of day (0-23) for hourly reset
  secondsUsedMonth: integer("seconds_used_month").default(0),
  relayCalls24h: integer("relay_calls_24h").default(0),
  relayPenaltyUntil: timestamp("relay_penalty_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUsageCounterSchema = createInsertSchema(usageCounters).omit({
  id: true,
  updatedAt: true,
});
export type InsertUsageCounter = z.infer<typeof insertUsageCounterSchema>;
export type UsageCounter = typeof usageCounters.$inferSelect;

// Active Calls tracking (for server-side call monitoring)
export const activeCalls = pgTable("active_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: text("call_session_id").notNull().unique(),
  callerAddress: text("caller_address").notNull(),
  calleeAddress: text("callee_address").notNull(),
  callerTier: text("caller_tier").notNull().default("free"), // 'free' | 'paid' | 'admin'
  calleeTier: text("callee_tier").notNull().default("free"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastHeartbeatCaller: timestamp("last_heartbeat_caller"),
  lastHeartbeatCallee: timestamp("last_heartbeat_callee"),
  relayUsed: boolean("relay_used").default(false),
  maxDurationSeconds: integer("max_duration_seconds").default(600), // 10 min default for free
});

export const insertActiveCallSchema = createInsertSchema(activeCalls).omit({
  id: true,
});
export type InsertActiveCall = z.infer<typeof insertActiveCallSchema>;
export type ActiveCall = typeof activeCalls.$inferSelect;

// Role hierarchy: ultra_god_admin > super_admin > admin > support > user
export const ROLE_HIERARCHY = ['user', 'support', 'admin', 'super_admin', 'ultra_god_admin'] as const;
export type AdminRole = typeof ROLE_HIERARCHY[number];

// Admin Permissions (granular RBAC)
export const adminPermissions = pgTable("admin_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAddress: text("user_address").notNull().unique(),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  expiresAt: timestamp("expires_at"),
  grantedBy: text("granted_by").notNull(),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminPermissionsSchema = createInsertSchema(adminPermissions).omit({
  id: true,
  grantedAt: true,
  updatedAt: true,
});
export type InsertAdminPermissions = z.infer<typeof insertAdminPermissionsSchema>;
export type AdminPermissions = typeof adminPermissions.$inferSelect;

// All available permissions
export const ALL_PERMISSIONS = [
  'users.read', 'users.write', 'users.suspend', 'users.impersonate', 'users.delete',
  'access.grant', 'access.revoke', 'access.trials',
  'admins.read', 'admins.manage', 'admins.create',
  'billing.read', 'billing.write', 'billing.refund',
  'security.read', 'security.write', 'security.2fa',
  'audit.read', 'audit.export',
  'system.settings', 'system.maintenance',
  'rate_limits.manage', 'blocklist.manage',
] as const;

// Admin Credentials (username/password authentication for admins)
export const adminCredentials = pgTable("admin_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(), // links to cryptoIdentities
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  lastPasswordChange: timestamp("last_password_change").defaultNow().notNull(),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminCredentialsSchema = createInsertSchema(adminCredentials).omit({
  id: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  lastPasswordChange: true,
});
export type InsertAdminCredentials = z.infer<typeof insertAdminCredentialsSchema>;
export type AdminCredentials = typeof adminCredentials.$inferSelect;

// Admin Sessions (for session management and impersonation)
export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminAddress: text("admin_address").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isImpersonating: boolean("is_impersonating").default(false),
  impersonatingAddress: text("impersonating_address"),
  impersonationReason: text("impersonation_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

export type AdminSession = typeof adminSessions.$inferSelect;

// System Settings (global config)
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  valueJson: jsonb("value_json").$type<unknown>(),
  description: text("description"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

// Default system settings keys
export const SYSTEM_SETTING_KEYS = {
  FREE_CALLS_PER_DAY: 'free_calls_per_day',
  FREE_MINUTES_PER_MONTH: 'free_minutes_per_month',
  FREE_MAX_CALL_DURATION: 'free_max_call_duration',
  REQUIRE_INVITE_CODE: 'require_invite_code',
  TURN_PAID_ONLY: 'turn_paid_only',
  MAINTENANCE_MODE: 'maintenance_mode',
  SIGNUPS_PAUSED: 'signups_paused',
  CALLS_PAUSED: 'calls_paused',
} as const;

// Promo Codes (global trial/discount codes)
export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("trial"), // 'trial' | 'pro_access' | 'discount'
  trialDays: integer("trial_days"),
  trialMinutes: integer("trial_minutes"),
  grantPlan: text("grant_plan"), // 'pro' | 'business'
  discountPercent: integer("discount_percent"),
  maxUses: integer("max_uses"),
  uses: integer("uses").default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
  uses: true,
  createdAt: true,
});
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

// IP Blocklist (abuse protection)
export const ipBlocklist = pgTable("ip_blocklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull(),
  reason: text("reason").notNull(),
  blockedBy: text("blocked_by").notNull(),
  blockedAt: timestamp("blocked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export type IpBlocklistEntry = typeof ipBlocklist.$inferSelect;

// Voicemail messages
export const voicemails = pgTable("voicemails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientAddress: text("recipient_address").notNull(), // Who receives the voicemail
  senderAddress: text("sender_address").notNull(), // Who left the voicemail
  senderName: text("sender_name"), // Optional display name
  audioData: text("audio_data").notNull(), // Base64 encoded audio
  audioFormat: text("audio_format").notNull().default("webm"), // 'webm' | 'mp3' | 'wav'
  durationSeconds: integer("duration_seconds").notNull(),
  transcription: text("transcription"), // AI-generated text transcription
  transcriptionStatus: text("transcription_status").default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
  isRead: boolean("is_read").default(false),
  isSaved: boolean("is_saved").default(false), // User can save important voicemails
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertVoicemailSchema = createInsertSchema(voicemails).omit({
  id: true,
  createdAt: true,
  readAt: true,
  deletedAt: true,
});
export type InsertVoicemail = z.infer<typeof insertVoicemailSchema>;
export type Voicemail = typeof voicemails.$inferSelect;

// Call token nonces - server-issued tokens for call authentication with replay protection
export const callTokenNonces = pgTable("call_token_nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nonceHash: text("nonce_hash").notNull().unique(), // SHA-256 hash of the nonce
  userAddress: text("user_address").notNull(),
  targetAddress: text("target_address"), // Optional: the call destination
  token: text("token").notNull().unique(), // The actual token string
  issuedAt: timestamp("issued_at").notNull(), // Server timestamp when issued
  expiresAt: timestamp("expires_at").notNull(), // When token expires
  usedAt: timestamp("used_at"), // When token was used (null = unused)
  usedByIp: text("used_by_ip"), // IP that used the token
  allowTurn: boolean("allow_turn").default(false), // Plan-based permission
  allowVideo: boolean("allow_video").default(true),
  plan: text("plan").notNull().default("free"),
});

export type CallTokenNonce = typeof callTokenNonces.$inferSelect;

// Token verification metrics for observability
export const tokenMetrics = pgTable("token_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // 'minted' | 'verify_ok' | 'verify_expired' | 'verify_skew' | 'verify_replay' | 'verify_invalid'
  userAddress: text("user_address"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  details: text("details"), // Additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TokenMetric = typeof tokenMetrics.$inferSelect;

// Persistent messages for offline delivery
export const persistentMessages = pgTable("persistent_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  convoId: text("convo_id").notNull(),
  content: text("content").notNull(),
  mediaType: text("media_type"), // 'text' | 'image' | 'video' | 'audio' | 'voice_note'
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("pending"), // 'pending' | 'delivered' | 'read'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
});

export const insertPersistentMessageSchema = createInsertSchema(persistentMessages).omit({
  id: true,
  createdAt: true,
  deliveredAt: true,
  readAt: true,
});
export type InsertPersistentMessage = z.infer<typeof insertPersistentMessageSchema>;
export type PersistentMessage = typeof persistentMessages.$inferSelect;

// Call rooms for group calls (mesh WebRTC)
export const callRooms = pgTable("call_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomCode: text("room_code").notNull().unique(), // Short code for sharing
  hostAddress: text("host_address").notNull(),
  name: text("name"), // Optional room name
  isVideo: boolean("is_video").default(true),
  isLocked: boolean("is_locked").default(false), // Host can lock room
  maxParticipants: integer("max_participants").notNull().default(10),
  status: text("status").notNull().default("active"), // 'active' | 'ended'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const insertCallRoomSchema = createInsertSchema(callRooms).omit({
  id: true,
  createdAt: true,
  endedAt: true,
});
export type InsertCallRoom = z.infer<typeof insertCallRoomSchema>;
export type CallRoom = typeof callRooms.$inferSelect;

// Call room participants
export const callRoomParticipants = pgTable("call_room_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  userAddress: text("user_address").notNull(),
  displayName: text("display_name"),
  isHost: boolean("is_host").default(false),
  isMuted: boolean("is_muted").default(false),
  isVideoOff: boolean("is_video_off").default(false),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const insertCallRoomParticipantSchema = createInsertSchema(callRoomParticipants).omit({
  id: true,
  joinedAt: true,
  leftAt: true,
});
export type InsertCallRoomParticipant = z.infer<typeof insertCallRoomParticipantSchema>;
export type CallRoomParticipant = typeof callRoomParticipants.$inferSelect;

// User Mode Settings - for PERSONAL/CREATOR/BUSINESS/STAGE modes
export const userModeSettings = pgTable("user_mode_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAddress: text("user_address").notNull().unique(),
  mode: text("mode").notNull().default("personal"), // 'personal' | 'creator' | 'business' | 'stage'
  flags: jsonb("flags").default({}), // Feature flags overrides
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserModeSettingsSchema = createInsertSchema(userModeSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertUserModeSettings = z.infer<typeof insertUserModeSettingsSchema>;
export type UserModeSettings = typeof userModeSettings.$inferSelect;

// Plan Entitlements - defines what each plan tier can do
export const planEntitlements = pgTable("plan_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: text("plan_id").notNull().unique(), // 'free' | 'pro' | 'business' | 'enterprise'
  maxCallIds: integer("max_call_ids").notNull().default(1),
  maxGroupParticipants: integer("max_group_participants").notNull().default(0),
  allowCallWaiting: boolean("allow_call_waiting").default(false),
  allowCallMerge: boolean("allow_call_merge").default(false),
  allowPaidCalls: boolean("allow_paid_calls").default(false),
  allowRoutingRules: boolean("allow_routing_rules").default(false),
  allowDelegation: boolean("allow_delegation").default(false),
  allowStageRooms: boolean("allow_stage_rooms").default(false),
  allowRecording: boolean("allow_recording").default(false),
  allowGroupCalls: boolean("allow_group_calls").default(false),
  maxCallMinutesPerMonth: integer("max_call_minutes_per_month"),
  maxCallsPerDay: integer("max_calls_per_day"),
  maxCallDurationMinutes: integer("max_call_duration_minutes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlanEntitlementsSchema = createInsertSchema(planEntitlements).omit({
  id: true,
  updatedAt: true,
});
export type InsertPlanEntitlements = z.infer<typeof insertPlanEntitlementsSchema>;
export type PlanEntitlements = typeof planEntitlements.$inferSelect;

// User Entitlement Overrides - Admin can override specific entitlements per user
export const userEntitlementOverrides = pgTable("user_entitlement_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAddress: text("user_address").notNull().unique(),
  overrides: jsonb("overrides").default({}), // Partial entitlement overrides
  grantedBy: text("granted_by"), // Admin address who granted
  expiresAt: timestamp("expires_at"), // Optional expiration
  reason: text("reason"), // Why the override was granted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserEntitlementOverridesSchema = createInsertSchema(userEntitlementOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserEntitlementOverrides = z.infer<typeof insertUserEntitlementOverridesSchema>;
export type UserEntitlementOverrides = typeof userEntitlementOverrides.$inferSelect;

// Re-export chat models for Gemini integration
export * from "./models/chat";
