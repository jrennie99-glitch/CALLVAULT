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

// Admin Audit Logs
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorAddress: text("actor_address").notNull(),
  targetAddress: text("target_address"),
  actionType: text("action_type").notNull(), // 'GRANT_TRIAL' | 'DISABLE_USER' | 'ENABLE_USER' | 'ROLE_CHANGE' | 'IMPERSONATE_START' | 'IMPERSONATE_END' | 'CREATE_USER'
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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
