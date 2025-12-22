import { 
  users, type User, type InsertUser,
  cryptoIdentities, type CryptoIdentityRecord, type InsertCryptoIdentity,
  contacts, type Contact, type InsertContact,
  callSessions, type CallSession, type InsertCallSession,
  paidCallTokens, type PaidCallToken, type InsertPaidCallToken,
  callQueueEntries, type CallQueueEntry, type InsertCallQueueEntry,
  creatorProfiles, type CreatorProfile, type InsertCreatorProfile,
  callDurationRecords, type CallDurationRecord, type InsertCallDurationRecord,
  creatorEarnings, type CreatorEarnings, type InsertCreatorEarnings,
  adminAuditLogs, type AdminAuditLog, type InsertAdminAuditLog,
  trialNoncesTable,
  inviteLinks, type InviteLink, type InsertInviteLink,
  inviteRedemptions, type InviteRedemption,
  cryptoInvoices, type CryptoInvoice, type InsertCryptoInvoice,
  usageCounters, type UsageCounter, type InsertUsageCounter,
  activeCalls, type ActiveCall, type InsertActiveCall,
  adminPermissions, type AdminPermissions, type InsertAdminPermissions,
  systemSettings, type SystemSetting,
  promoCodes, type PromoCode, type InsertPromoCode,
  ipBlocklist, type IpBlocklistEntry,
  adminSessions, type AdminSession,
  adminCredentials, type AdminCredentials, type InsertAdminCredentials,
  voicemails, type Voicemail, type InsertVoicemail,
  callTokenNonces, type CallTokenNonce,
  tokenMetrics, type TokenMetric,
  persistentMessages, type PersistentMessage,
  callRooms, type CallRoom, type InsertCallRoom,
  callRoomParticipants, type CallRoomParticipant, type InsertCallRoomParticipant,
  userModeSettings, type UserModeSettings, type InsertUserModeSettings,
  planEntitlements, type PlanEntitlements, type InsertPlanEntitlements,
  userEntitlementOverrides, type UserEntitlementOverrides, type InsertUserEntitlementOverrides,
  linkedAddresses, type LinkedAddress,
  pushSubscriptions, type PushSubscription,
  devicePushTokens, type DevicePushToken,
  identityVaults, type IdentityVault, type InsertIdentityVault,
  vaultAccessLogs, type VaultAccessLog, type InsertVaultAccessLog,
  callIdSettings, type CallIdSettings, type InsertCallIdSettings,
  platformPricing, type PlatformPricing, type InsertPlatformPricing,
  subscriptionPurchases, type SubscriptionPurchase, type InsertSubscriptionPurchase,
  scheduledCalls, type ScheduledCall, type InsertScheduledCall,
  teams, type Team, type InsertTeam,
  teamMembers, type TeamMember, type InsertTeamMember,
} from "@shared/schema";
import type { UserMode, FeatureFlags } from "@shared/types";
import { randomUUID, createHash } from "crypto";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, ilike, or, gt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getIdentity(address: string): Promise<CryptoIdentityRecord | undefined>;
  createIdentity(identity: InsertCryptoIdentity): Promise<CryptoIdentityRecord>;
  updateIdentity(address: string, updates: Partial<InsertCryptoIdentity>): Promise<CryptoIdentityRecord | undefined>;

  getContacts(ownerAddress: string): Promise<Contact[]>;
  getContact(ownerAddress: string, contactAddress: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, updates: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;

  getCallSession(id: string): Promise<CallSession | undefined>;
  getCallHistory(address: string, limit?: number): Promise<CallSession[]>;
  createCallSession(session: InsertCallSession): Promise<CallSession>;
  updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined>;

  getPaidCallToken(token: string): Promise<PaidCallToken | undefined>;
  getPaidCallTokenById(id: string): Promise<PaidCallToken | undefined>;
  createPaidCallToken(tokenData: InsertPaidCallToken): Promise<PaidCallToken>;
  updatePaidCallToken(id: string, updates: Partial<PaidCallToken>): Promise<PaidCallToken | undefined>;
  getCreatorPaidTokens(creatorAddress: string): Promise<PaidCallToken[]>;

  getCallQueue(creatorAddress: string): Promise<CallQueueEntry[]>;
  addToCallQueue(entry: InsertCallQueueEntry): Promise<CallQueueEntry>;
  updateQueueEntry(id: string, updates: Partial<CallQueueEntry>): Promise<CallQueueEntry | undefined>;
  removeFromQueue(id: string): Promise<boolean>;

  getCreatorProfile(ownerAddress: string): Promise<CreatorProfile | undefined>;
  getCreatorProfileByHandle(handle: string): Promise<CreatorProfile | undefined>;
  createCreatorProfile(profile: InsertCreatorProfile): Promise<CreatorProfile>;
  updateCreatorProfile(ownerAddress: string, updates: Partial<InsertCreatorProfile>): Promise<CreatorProfile | undefined>;

  getCallDurationRecord(callSessionId: string): Promise<CallDurationRecord | undefined>;
  createCallDurationRecord(record: InsertCallDurationRecord): Promise<CallDurationRecord>;
  updateCallDurationRecord(id: string, updates: Partial<CallDurationRecord>): Promise<CallDurationRecord | undefined>;

  getCreatorEarnings(creatorAddress: string, period?: string): Promise<CreatorEarnings[]>;
  createOrUpdateEarnings(earnings: InsertCreatorEarnings): Promise<CreatorEarnings>;
  getCreatorStats(creatorAddress: string): Promise<{
    totalCalls: number;
    totalMinutes: number;
    totalEarnings: number;
    paidCalls: number;
  }>;

  // Admin methods
  getAllIdentities(options?: { search?: string; limit?: number; offset?: number }): Promise<CryptoIdentityRecord[]>;
  countIdentities(): Promise<number>;
  updateIdentityRole(address: string, role: string, actorAddress: string): Promise<CryptoIdentityRecord | undefined>;
  setIdentityDisabled(address: string, disabled: boolean, actorAddress: string): Promise<CryptoIdentityRecord | undefined>;
  grantTrial(address: string, trialDays?: number, trialMinutes?: number, actorAddress?: string): Promise<CryptoIdentityRecord | undefined>;
  consumeTrialMinutes(address: string, minutes: number): Promise<CryptoIdentityRecord | undefined>;
  checkTrialAccess(address: string): Promise<{ hasAccess: boolean; reason?: string }>;
  checkPremiumAccess(address: string): Promise<{ hasAccess: boolean; accessType: 'subscription' | 'trial' | 'none'; reason?: string; daysRemaining?: number }>;
  updateSubscriptionStatus(address: string, status: string, stripeSubscriptionId?: string): Promise<CryptoIdentityRecord | undefined>;
  updateStripeCustomer(address: string, stripeCustomerId: string): Promise<CryptoIdentityRecord | undefined>;
  
  // Audit logs
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAuditLogs(options?: { actorAddress?: string; targetAddress?: string; limit?: number }): Promise<AdminAuditLog[]>;
  
  // Trial nonces (replay protection)
  isTrialNonceUsed(address: string, nonce: string): Promise<boolean>;
  markTrialNonceUsed(address: string, nonce: string): Promise<boolean>;
  cleanupOldTrialNonces(): Promise<void>;

  // Plan management
  updatePlan(address: string, plan: string, actorAddress?: string): Promise<CryptoIdentityRecord | undefined>;
  
  // Invite links
  getInviteLink(code: string): Promise<InviteLink | undefined>;
  getInviteLinkById(id: string): Promise<InviteLink | undefined>;
  getAllInviteLinks(createdByAddress?: string): Promise<InviteLink[]>;
  getInviteLinksByCreator(creatorAddress: string): Promise<InviteLink[]>;
  createInviteLink(link: InsertInviteLink): Promise<InviteLink>;
  updateInviteLink(id: string, updates: Partial<InviteLink>): Promise<InviteLink | undefined>;
  deleteInviteLink(id: string): Promise<boolean>;
  redeemInviteLink(code: string, redeemerAddress: string): Promise<{ success: boolean; error?: string; link?: InviteLink }>;
  getInviteRedemptions(inviteLinkId: string): Promise<InviteRedemption[]>;
  
  // Contact management
  createOrUpdateContact(ownerAddress: string, contactAddress: string, name: string): Promise<Contact>;

  // Identity vault (cross-browser sync)
  getIdentityVault(publicKeyBase58: string): Promise<IdentityVault | undefined>;
  createIdentityVault(vault: InsertIdentityVault): Promise<IdentityVault>;
  updateIdentityVault(publicKeyBase58: string, updates: Partial<IdentityVault>): Promise<IdentityVault | undefined>;
  
  // Vault access logging and rate limiting
  logVaultAccess(log: InsertVaultAccessLog): Promise<VaultAccessLog>;
  getRecentVaultAccessAttempts(publicKeyBase58: string, minutesAgo: number): Promise<VaultAccessLog[]>;
  getVaultAccessesByIp(ipAddress: string, minutesAgo: number): Promise<VaultAccessLog[]>;

  // Entitlement helpers
  canUseProFeatures(address: string): Promise<boolean>;
  canUseBusinessFeatures(address: string): Promise<boolean>;
  
  // Stats
  getAdminStats(): Promise<{
    totalUsers: number;
    activeTrials: number;
    proPlans: number;
    businessPlans: number;
    disabledUsers: number;
    adminCount: number;
  }>;

  // Crypto invoices
  getCryptoInvoice(id: string): Promise<CryptoInvoice | undefined>;
  getCryptoInvoiceByTxHash(txHash: string): Promise<CryptoInvoice | undefined>;
  getCryptoInvoicesByPayToken(payTokenId: string): Promise<CryptoInvoice[]>;
  createCryptoInvoice(invoice: InsertCryptoInvoice): Promise<CryptoInvoice>;
  updateCryptoInvoice(id: string, updates: Partial<CryptoInvoice>): Promise<CryptoInvoice | undefined>;
  getRecentCryptoInvoices(limit?: number): Promise<CryptoInvoice[]>;
  expireOldCryptoInvoices(): Promise<number>;

  // Usage counters (Free Tier Cost Shield)
  getUsageCounter(userAddress: string): Promise<UsageCounter | undefined>;
  getOrCreateUsageCounter(userAddress: string): Promise<UsageCounter>;
  updateUsageCounter(userAddress: string, updates: Partial<UsageCounter>): Promise<UsageCounter | undefined>;
  incrementCallsStarted(userAddress: string): Promise<UsageCounter>;
  incrementFailedStarts(userAddress: string): Promise<UsageCounter>;
  incrementCallAttempts(userAddress: string): Promise<UsageCounter>;
  addSecondsUsed(userAddress: string, seconds: number): Promise<UsageCounter>;
  incrementRelayCalls(userAddress: string): Promise<UsageCounter>;

  // Active calls (server-side call monitoring)
  getActiveCall(callSessionId: string): Promise<ActiveCall | undefined>;
  getActiveCallsForUser(userAddress: string): Promise<ActiveCall[]>;
  createActiveCall(call: InsertActiveCall): Promise<ActiveCall>;
  updateActiveCall(callSessionId: string, updates: Partial<ActiveCall>): Promise<ActiveCall | undefined>;
  deleteActiveCall(callSessionId: string): Promise<boolean>;
  getAllActiveCalls(): Promise<ActiveCall[]>;
  getStaleActiveCalls(heartbeatThresholdSeconds: number): Promise<ActiveCall[]>;

  // User tier management
  getUserTier(address: string): Promise<'free' | 'paid' | 'admin'>;
  setUserTier(address: string, tier: 'free' | 'paid' | 'admin', actorAddress: string): Promise<CryptoIdentityRecord | undefined>;
  setCompedStatus(address: string, isComped: boolean, actorAddress: string): Promise<CryptoIdentityRecord | undefined>;
  getAllUsageCounters(limit?: number): Promise<UsageCounter[]>;

  // Freeze Mode
  getAlwaysAllowedContacts(ownerAddress: string): Promise<Contact[]>;
  isContactAlwaysAllowed(ownerAddress: string, contactAddress: string): Promise<boolean>;
  setContactAlwaysAllowed(ownerAddress: string, contactAddress: string, alwaysAllowed: boolean): Promise<Contact | undefined>;
  getFreezeModeSetting(address: string): Promise<{ enabled: boolean; setupCompleted: boolean }>;
  setFreezeMode(address: string, enabled: boolean): Promise<CryptoIdentityRecord | undefined>;
  setFreezeModeSetupCompleted(address: string): Promise<CryptoIdentityRecord | undefined>;

  // Admin Permissions (RBAC)
  getAdminPermissions(userAddress: string): Promise<AdminPermissions | undefined>;
  setAdminPermissions(data: InsertAdminPermissions): Promise<AdminPermissions>;
  updateAdminPermissions(userAddress: string, permissions: string[], expiresAt?: Date): Promise<AdminPermissions | undefined>;
  deleteAdminPermissions(userAddress: string): Promise<boolean>;

  // System Settings
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: unknown, updatedBy: string, description?: string): Promise<SystemSetting>;
  getAllSystemSettings(): Promise<SystemSetting[]>;

  // Promo Codes
  getPromoCode(code: string): Promise<PromoCode | undefined>;
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, updates: Partial<PromoCode>): Promise<PromoCode | undefined>;
  getAllPromoCodes(): Promise<PromoCode[]>;

  // IP Blocklist
  getBlockedIp(ipAddress: string): Promise<IpBlocklistEntry | undefined>;
  blockIp(ipAddress: string, reason: string, blockedBy: string, expiresAt?: Date): Promise<IpBlocklistEntry>;
  unblockIp(ipAddress: string): Promise<boolean>;
  getAllBlockedIps(): Promise<IpBlocklistEntry[]>;

  // Admin Sessions
  getAdminSession(sessionToken: string): Promise<AdminSession | undefined>;
  getAdminSessionsForUser(adminAddress: string): Promise<AdminSession[]>;
  createAdminSession(adminAddress: string, ipAddress?: string, userAgent?: string): Promise<AdminSession>;
  revokeAdminSession(sessionToken: string): Promise<boolean>;
  revokeAllAdminSessions(adminAddress: string): Promise<number>;

  // Extended user management
  suspendUser(address: string, reason: string, suspendedBy: string): Promise<CryptoIdentityRecord | undefined>;
  unsuspendUser(address: string): Promise<CryptoIdentityRecord | undefined>;
  softBanUser(address: string, reason: string, bannedBy: string): Promise<CryptoIdentityRecord | undefined>;
  grantFreeAccess(address: string, endAt: Date, actorAddress: string): Promise<CryptoIdentityRecord | undefined>;

  // Admin Credentials (username/password auth)
  getAdminCredentialsByUsername(username: string): Promise<AdminCredentials | undefined>;
  getAdminCredentialsByAddress(address: string): Promise<AdminCredentials | undefined>;
  createAdminCredentials(creds: InsertAdminCredentials): Promise<AdminCredentials>;
  updateAdminCredentials(address: string, updates: Partial<AdminCredentials>): Promise<AdminCredentials | undefined>;
  incrementFailedLoginAttempts(address: string): Promise<AdminCredentials | undefined>;
  resetFailedLoginAttempts(address: string): Promise<AdminCredentials | undefined>;
  lockAdminAccount(address: string, untilDate: Date): Promise<AdminCredentials | undefined>;

  // Voicemail
  getVoicemails(recipientAddress: string): Promise<Voicemail[]>;
  getVoicemail(id: string): Promise<Voicemail | undefined>;
  createVoicemail(voicemail: InsertVoicemail): Promise<Voicemail>;
  updateVoicemail(id: string, updates: Partial<Voicemail>): Promise<Voicemail | undefined>;
  markVoicemailRead(id: string): Promise<Voicemail | undefined>;
  deleteVoicemail(id: string): Promise<boolean>;
  getUnreadVoicemailCount(recipientAddress: string): Promise<number>;

  // Linked Addresses (multiple numbers under one account)
  getLinkedAddresses(primaryAddress: string): Promise<LinkedAddress[]>;
  getPrimaryAddress(linkedAddress: string): Promise<string | undefined>;
  linkAddress(primaryAddress: string, linkedAddress: string, linkedPublicKey: string, label?: string): Promise<LinkedAddress>;
  unlinkAddress(linkedAddress: string): Promise<boolean>;
  updateLinkedAddressLabel(linkedAddress: string, label: string): Promise<LinkedAddress | undefined>;
  isAddressLinked(address: string): Promise<boolean>;
  
  // Call ID Settings (DND, call waiting, per-line)
  getCallIdSettings(callIdAddress: string): Promise<CallIdSettings | undefined>;
  ensureCallIdSettings(callIdAddress: string, ownerAddress: string): Promise<CallIdSettings>;
  updateCallIdSettings(callIdAddress: string, updates: Partial<InsertCallIdSettings>): Promise<CallIdSettings | undefined>;
  getAllCallIdSettings(ownerAddress: string): Promise<CallIdSettings[]>;

  // Token metrics (observability)
  recordTokenMetric(eventType: string, userAddress?: string, userAgent?: string, ipAddress?: string, details?: string): Promise<void>;
  getTokenMetrics(since: Date, eventType?: string): Promise<{ eventType: string; count: number }[]>;
  getTokenLogs(since: Date, limit?: number): Promise<{ id: string; eventType: string; userAddress: string | null; ipAddress: string | null; details: string | null; createdAt: Date }[]>;

  // Call token nonces (server-issued tokens with replay protection)
  createCallToken(userAddress: string, targetAddress?: string, plan?: string, allowTurn?: boolean, allowVideo?: boolean): Promise<{ token: string; nonce: string; issuedAt: Date; expiresAt: Date }>;
  verifyCallToken(token: string, markUsed?: boolean, usedByIp?: string): Promise<{ valid: boolean; reason?: string; data?: { userAddress: string; plan: string; allowTurn: boolean; allowVideo: boolean } }>;
  cleanupExpiredCallTokens(): Promise<number>;

  // Persistent messages (offline delivery)
  storeMessage(fromAddress: string, toAddress: string, convoId: string, content: string, mediaType?: string, mediaUrl?: string): Promise<{ id: string; createdAt: Date }>;
  getPendingMessages(toAddress: string): Promise<{ id: string; fromAddress: string; toAddress: string; convoId: string; content: string; mediaType: string | null; mediaUrl: string | null; createdAt: Date }[]>;
  markMessageDelivered(messageId: string): Promise<void>;
  markMessageRead(messageId: string): Promise<void>;

  // Call Rooms (group calls)
  createCallRoom(hostAddress: string, isVideo: boolean, name?: string, maxParticipants?: number): Promise<{ id: string; roomCode: string }>;
  getCallRoom(roomId: string): Promise<{ id: string; roomCode: string; hostAddress: string; name: string | null; isVideo: boolean; isLocked: boolean; maxParticipants: number; status: string; createdAt: Date } | undefined>;
  getCallRoomByCode(roomCode: string): Promise<{ id: string; roomCode: string; hostAddress: string; name: string | null; isVideo: boolean; isLocked: boolean; maxParticipants: number; status: string; createdAt: Date } | undefined>;
  updateCallRoom(roomId: string, updates: { isLocked?: boolean; status?: string; endedAt?: Date }): Promise<void>;
  addRoomParticipant(roomId: string, userAddress: string, displayName?: string, isHost?: boolean): Promise<{ id: string }>;
  removeRoomParticipant(roomId: string, userAddress: string): Promise<void>;
  getRoomParticipants(roomId: string): Promise<{ userAddress: string; displayName: string | null; isHost: boolean; isMuted: boolean; isVideoOff: boolean; joinedAt: Date }[]>;
  getRoomParticipantCount(roomId: string): Promise<number>;
  isUserInRoom(roomId: string, userAddress: string): Promise<boolean>;
  updateParticipantMedia(roomId: string, userAddress: string, updates: { isMuted?: boolean; isVideoOff?: boolean }): Promise<void>;
  
  // Native device push tokens (FCM/APNs)
  saveDevicePushToken(userAddress: string, platform: string, token: string, deviceInfo?: string, appVersion?: string): Promise<void>;
  getDevicePushTokens(userAddress: string): Promise<{ platform: string; token: string; deviceInfo: string | null; appVersion: string | null }[]>;
  deleteDevicePushToken(userAddress: string, token: string): Promise<void>;
  deleteAllDevicePushTokens(userAddress: string): Promise<number>;
  updateDevicePushTokenStatus(token: string, success: boolean, error?: string): Promise<void>;
  getAllDevicePushTokensForUsers(userAddresses: string[]): Promise<{ userAddress: string; platform: string; token: string }[]>;
  
  // Platform pricing (platform-specific prices for web/android/ios)
  getPlatformPricing(): Promise<PlatformPricing[]>;
  getPlatformPricingByPlan(planId: string): Promise<PlatformPricing | undefined>;
  upsertPlatformPricing(pricing: InsertPlatformPricing): Promise<PlatformPricing>;
  
  // Subscription purchases (cross-provider purchase tracking)
  createSubscriptionPurchase(purchase: InsertSubscriptionPurchase): Promise<SubscriptionPurchase>;
  getSubscriptionPurchaseByUser(userAddress: string): Promise<SubscriptionPurchase | undefined>;
  getSubscriptionPurchaseByTransaction(provider: string, transactionId: string): Promise<SubscriptionPurchase | undefined>;
  updateSubscriptionPurchase(id: string, updates: Partial<SubscriptionPurchase>): Promise<SubscriptionPurchase | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getIdentity(address: string): Promise<CryptoIdentityRecord | undefined> {
    const [identity] = await db.select().from(cryptoIdentities).where(eq(cryptoIdentities.address, address));
    return identity || undefined;
  }

  async createIdentity(identity: InsertCryptoIdentity): Promise<CryptoIdentityRecord> {
    const [created] = await db.insert(cryptoIdentities).values(identity).returning();
    return created;
  }

  async updateIdentity(address: string, updates: Partial<InsertCryptoIdentity>): Promise<CryptoIdentityRecord | undefined> {
    const [updated] = await db.update(cryptoIdentities).set(updates).where(eq(cryptoIdentities.address, address)).returning();
    return updated || undefined;
  }

  async getContacts(ownerAddress: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.ownerAddress, ownerAddress)).orderBy(asc(contacts.name));
  }

  async getContact(ownerAddress: string, contactAddress: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(
      and(eq(contacts.ownerAddress, ownerAddress), eq(contacts.contactAddress, contactAddress))
    );
    return contact || undefined;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async updateContact(id: string, updates: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();
    return updated || undefined;
  }

  async deleteContact(id: string): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return result.length > 0;
  }

  async getCallSession(id: string): Promise<CallSession | undefined> {
    const [session] = await db.select().from(callSessions).where(eq(callSessions.id, id));
    return session || undefined;
  }

  async getCallHistory(address: string, limit: number = 50): Promise<CallSession[]> {
    return db.select().from(callSessions)
      .where(sql`${callSessions.callerAddress} = ${address} OR ${callSessions.calleeAddress} = ${address}`)
      .orderBy(desc(callSessions.startedAt))
      .limit(limit);
  }

  async createCallSession(session: InsertCallSession): Promise<CallSession> {
    const [created] = await db.insert(callSessions).values(session).returning();
    return created;
  }

  async updateCallSession(id: string, updates: Partial<CallSession>): Promise<CallSession | undefined> {
    const [updated] = await db.update(callSessions).set(updates).where(eq(callSessions.id, id)).returning();
    return updated || undefined;
  }

  async getPaidCallToken(token: string): Promise<PaidCallToken | undefined> {
    const [tokenRecord] = await db.select().from(paidCallTokens).where(eq(paidCallTokens.token, token));
    return tokenRecord || undefined;
  }

  async getPaidCallTokenById(id: string): Promise<PaidCallToken | undefined> {
    const [tokenRecord] = await db.select().from(paidCallTokens).where(eq(paidCallTokens.id, id));
    return tokenRecord || undefined;
  }

  async createPaidCallToken(tokenData: InsertPaidCallToken): Promise<PaidCallToken> {
    const [created] = await db.insert(paidCallTokens).values(tokenData).returning();
    return created;
  }

  async updatePaidCallToken(id: string, updates: Partial<PaidCallToken>): Promise<PaidCallToken | undefined> {
    const [updated] = await db.update(paidCallTokens).set(updates).where(eq(paidCallTokens.id, id)).returning();
    return updated || undefined;
  }

  async getCreatorPaidTokens(creatorAddress: string): Promise<PaidCallToken[]> {
    return db.select().from(paidCallTokens)
      .where(eq(paidCallTokens.creatorAddress, creatorAddress))
      .orderBy(desc(paidCallTokens.createdAt));
  }

  async getCallQueue(creatorAddress: string): Promise<CallQueueEntry[]> {
    // Priority routing: higher priority users (Business=100, Pro=50, Free=0) get served first
    // Within same priority, maintain FIFO by position
    return db.select().from(callQueueEntries)
      .where(and(eq(callQueueEntries.creatorAddress, creatorAddress), eq(callQueueEntries.status, "waiting")))
      .orderBy(desc(callQueueEntries.callPriority), asc(callQueueEntries.position));
  }

  async addToCallQueue(entry: InsertCallQueueEntry): Promise<CallQueueEntry> {
    const [created] = await db.insert(callQueueEntries).values(entry).returning();
    return created;
  }

  async updateQueueEntry(id: string, updates: Partial<CallQueueEntry>): Promise<CallQueueEntry | undefined> {
    const [updated] = await db.update(callQueueEntries).set(updates).where(eq(callQueueEntries.id, id)).returning();
    return updated || undefined;
  }

  async removeFromQueue(id: string): Promise<boolean> {
    const result = await db.delete(callQueueEntries).where(eq(callQueueEntries.id, id)).returning();
    return result.length > 0;
  }

  async getCreatorProfile(ownerAddress: string): Promise<CreatorProfile | undefined> {
    const [profile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.ownerAddress, ownerAddress));
    return profile || undefined;
  }

  async getCreatorProfileByHandle(handle: string): Promise<CreatorProfile | undefined> {
    const [profile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.handle, handle));
    return profile || undefined;
  }

  async createCreatorProfile(profile: InsertCreatorProfile): Promise<CreatorProfile> {
    const [created] = await db.insert(creatorProfiles).values(profile).returning();
    return created;
  }

  async updateCreatorProfile(ownerAddress: string, updates: Partial<InsertCreatorProfile>): Promise<CreatorProfile | undefined> {
    const updateData = { ...updates, updatedAt: new Date() };
    const [updated] = await db.update(creatorProfiles).set(updateData).where(eq(creatorProfiles.ownerAddress, ownerAddress)).returning();
    return updated || undefined;
  }

  async getCallDurationRecord(callSessionId: string): Promise<CallDurationRecord | undefined> {
    const [record] = await db.select().from(callDurationRecords).where(eq(callDurationRecords.callSessionId, callSessionId));
    return record || undefined;
  }

  async createCallDurationRecord(record: InsertCallDurationRecord): Promise<CallDurationRecord> {
    const [created] = await db.insert(callDurationRecords).values(record).returning();
    return created;
  }

  async updateCallDurationRecord(id: string, updates: Partial<CallDurationRecord>): Promise<CallDurationRecord | undefined> {
    const [updated] = await db.update(callDurationRecords).set(updates).where(eq(callDurationRecords.id, id)).returning();
    return updated || undefined;
  }

  async getCreatorEarnings(creatorAddress: string, period?: string): Promise<CreatorEarnings[]> {
    if (period) {
      return db.select().from(creatorEarnings)
        .where(and(eq(creatorEarnings.creatorAddress, creatorAddress), eq(creatorEarnings.period, period)))
        .orderBy(desc(creatorEarnings.periodStart));
    }
    return db.select().from(creatorEarnings)
      .where(eq(creatorEarnings.creatorAddress, creatorAddress))
      .orderBy(desc(creatorEarnings.periodStart));
  }

  async createOrUpdateEarnings(earnings: InsertCreatorEarnings): Promise<CreatorEarnings> {
    const existing = await db.select().from(creatorEarnings)
      .where(and(
        eq(creatorEarnings.creatorAddress, earnings.creatorAddress),
        eq(creatorEarnings.period, earnings.period),
        eq(creatorEarnings.periodStart, earnings.periodStart)
      ));
    
    if (existing.length > 0) {
      const [updated] = await db.update(creatorEarnings)
        .set(earnings)
        .where(eq(creatorEarnings.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(creatorEarnings).values(earnings).returning();
    return created;
  }

  async getCreatorStats(creatorAddress: string): Promise<{
    totalCalls: number;
    totalMinutes: number;
    totalEarnings: number;
    paidCalls: number;
  }> {
    const sessions = await db.select().from(callSessions)
      .where(eq(callSessions.calleeAddress, creatorAddress));
    
    const totalCalls = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / 60;
    const paidCalls = sessions.filter(s => s.isPaid).length;
    const totalEarnings = sessions.reduce((sum, s) => sum + (s.amountPaid || 0), 0);

    return { totalCalls, totalMinutes: Math.round(totalMinutes), totalEarnings, paidCalls };
  }

  // Admin methods
  async getAllIdentities(options?: { search?: string; limit?: number; offset?: number }): Promise<CryptoIdentityRecord[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    
    if (options?.search) {
      return db.select().from(cryptoIdentities)
        .where(or(
          ilike(cryptoIdentities.address, `%${options.search}%`),
          ilike(cryptoIdentities.displayName, `%${options.search}%`)
        ))
        .orderBy(desc(cryptoIdentities.createdAt))
        .limit(limit)
        .offset(offset);
    }
    
    return db.select().from(cryptoIdentities)
      .orderBy(desc(cryptoIdentities.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countIdentities(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(cryptoIdentities);
    return Number(result[0]?.count ?? 0);
  }

  async updateIdentityRole(address: string, role: string, actorAddress: string): Promise<CryptoIdentityRecord | undefined> {
    const [updated] = await db.update(cryptoIdentities)
      .set({ role })
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    if (updated) {
      await this.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'ROLE_CHANGE',
        metadata: { newRole: role }
      });
    }
    
    return updated || undefined;
  }

  async setIdentityDisabled(address: string, disabled: boolean, actorAddress: string): Promise<CryptoIdentityRecord | undefined> {
    const [updated] = await db.update(cryptoIdentities)
      .set({ isDisabled: disabled })
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    if (updated) {
      await this.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: disabled ? 'DISABLE_USER' : 'ENABLE_USER',
        metadata: {}
      });
    }
    
    return updated || undefined;
  }

  async grantTrial(address: string, trialDays?: number, trialMinutes?: number, actorAddress?: string): Promise<CryptoIdentityRecord | undefined> {
    const now = new Date();
    const updates: Partial<CryptoIdentityRecord> = {
      trialStatus: 'active',
      trialStartAt: now,
    };

    if (trialDays) {
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + trialDays);
      updates.trialEndAt = endDate;
    }

    if (trialMinutes) {
      updates.trialMinutesRemaining = trialMinutes;
    }

    const [updated] = await db.update(cryptoIdentities)
      .set(updates)
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    if (updated && actorAddress) {
      await this.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'GRANT_TRIAL',
        metadata: { trialDays, trialMinutes }
      });
    }
    
    return updated || undefined;
  }

  async consumeTrialMinutes(address: string, minutes: number): Promise<CryptoIdentityRecord | undefined> {
    const identity = await this.getIdentity(address);
    if (!identity || !identity.trialMinutesRemaining) return undefined;

    const remaining = Math.max(0, identity.trialMinutesRemaining - minutes);
    const updates: Partial<CryptoIdentityRecord> = {
      trialMinutesRemaining: remaining,
    };

    if (remaining === 0) {
      updates.trialStatus = 'expired';
    }

    const [updated] = await db.update(cryptoIdentities)
      .set(updates)
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    return updated || undefined;
  }

  async checkTrialAccess(address: string): Promise<{ hasAccess: boolean; reason?: string }> {
    const identity = await this.getIdentity(address);
    if (!identity) return { hasAccess: false, reason: 'User not found' };

    if (identity.trialStatus !== 'active') {
      return { hasAccess: false, reason: 'No active trial' };
    }

    // Check date-based trial
    if (identity.trialEndAt) {
      if (new Date() > identity.trialEndAt) {
        await db.update(cryptoIdentities)
          .set({ trialStatus: 'expired' })
          .where(eq(cryptoIdentities.address, address));
        return { hasAccess: false, reason: 'Trial expired' };
      }
      return { hasAccess: true };
    }

    // Check minute-based trial
    if (identity.trialMinutesRemaining !== null && identity.trialMinutesRemaining !== undefined) {
      if (identity.trialMinutesRemaining <= 0) {
        return { hasAccess: false, reason: 'No trial minutes remaining' };
      }
      return { hasAccess: true };
    }

    return { hasAccess: false, reason: 'Invalid trial configuration' };
  }

  async checkPremiumAccess(address: string): Promise<{ hasAccess: boolean; accessType: 'subscription' | 'trial' | 'none'; reason?: string; daysRemaining?: number }> {
    const identity = await this.getIdentity(address);
    if (!identity) return { hasAccess: false, accessType: 'none', reason: 'User not found' };

    // Check if subscription was cancelled - no access even if trial exists
    if (identity.planStatus === 'cancelled' || identity.planStatus === 'none') {
      // If there's a cancelled subscription, don't fall through to trial
      if (identity.stripeSubscriptionId && identity.planStatus === 'cancelled') {
        return { hasAccess: false, accessType: 'none', reason: 'Subscription cancelled' };
      }
    }

    // Check active subscription status first
    if (identity.planStatus === 'active' && identity.plan !== 'free') {
      const daysRemaining = identity.planRenewalAt 
        ? Math.ceil((new Date(identity.planRenewalAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : undefined;
      return { hasAccess: true, accessType: 'subscription', daysRemaining };
    }
    
    // Check past_due subscription - still grant access but warn
    if (identity.planStatus === 'past_due' && identity.plan !== 'free') {
      const daysRemaining = identity.planRenewalAt 
        ? Math.ceil((new Date(identity.planRenewalAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : undefined;
      return { hasAccess: true, accessType: 'subscription', daysRemaining, reason: 'Payment past due' };
    }

    // Only check trial if no subscription exists
    if (!identity.stripeSubscriptionId && identity.trialStatus === 'active') {
      // Check date-based trial
      if (identity.trialEndAt) {
        if (new Date() > identity.trialEndAt) {
          await db.update(cryptoIdentities)
            .set({ trialStatus: 'expired' })
            .where(eq(cryptoIdentities.address, address));
          return { hasAccess: false, accessType: 'none', reason: 'Trial expired' };
        }
        const daysRemaining = Math.ceil((new Date(identity.trialEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return { hasAccess: true, accessType: 'trial', daysRemaining };
      }

      // Check minute-based trial
      if (identity.trialMinutesRemaining !== null && identity.trialMinutesRemaining !== undefined) {
        if (identity.trialMinutesRemaining <= 0) {
          return { hasAccess: false, accessType: 'none', reason: 'No trial minutes remaining' };
        }
        return { hasAccess: true, accessType: 'trial' };
      }
    }

    return { hasAccess: false, accessType: 'none', reason: 'No active subscription or trial' };
  }

  async updateSubscriptionStatus(address: string, status: string, stripeSubscriptionId?: string): Promise<CryptoIdentityRecord | undefined> {
    const updates: Partial<CryptoIdentityRecord> = {
      planStatus: status as any,
    };
    
    if (stripeSubscriptionId) {
      updates.stripeSubscriptionId = stripeSubscriptionId;
    }

    // Update plan based on status
    if (status === 'active') {
      updates.plan = 'pro';
      updates.planRenewalAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (status === 'canceled' || status === 'past_due') {
      // Keep plan but mark status
    }

    const [updated] = await db.update(cryptoIdentities)
      .set(updates)
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    return updated || undefined;
  }

  async updateStripeCustomer(address: string, stripeCustomerId: string): Promise<CryptoIdentityRecord | undefined> {
    const [updated] = await db.update(cryptoIdentities)
      .set({ stripeCustomerId })
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    return updated || undefined;
  }

  // Audit logs
  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [created] = await db.insert(adminAuditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(options?: { actorAddress?: string; targetAddress?: string; limit?: number }): Promise<AdminAuditLog[]> {
    const limit = options?.limit ?? 100;
    
    if (options?.actorAddress && options?.targetAddress) {
      return db.select().from(adminAuditLogs)
        .where(and(
          eq(adminAuditLogs.actorAddress, options.actorAddress),
          eq(adminAuditLogs.targetAddress, options.targetAddress)
        ))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit);
    }
    
    if (options?.actorAddress) {
      return db.select().from(adminAuditLogs)
        .where(eq(adminAuditLogs.actorAddress, options.actorAddress))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit);
    }
    
    if (options?.targetAddress) {
      return db.select().from(adminAuditLogs)
        .where(eq(adminAuditLogs.targetAddress, options.targetAddress))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit);
    }
    
    return db.select().from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit);
  }

  // Trial nonces (replay protection) - atomic check-and-insert
  async isTrialNonceUsed(address: string, nonce: string): Promise<boolean> {
    const [existing] = await db.select().from(trialNoncesTable)
      .where(and(
        eq(trialNoncesTable.address, address),
        eq(trialNoncesTable.nonce, nonce)
      ));
    return !!existing;
  }

  async markTrialNonceUsed(address: string, nonce: string): Promise<boolean> {
    try {
      await db.insert(trialNoncesTable).values({ address, nonce });
      return true;
    } catch (error: any) {
      // Unique constraint violation means nonce was already used (race condition)
      if (error.code === '23505') {
        return false;
      }
      throw error;
    }
  }

  async cleanupOldTrialNonces(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.delete(trialNoncesTable).where(lte(trialNoncesTable.usedAt, oneHourAgo));
  }

  // Plan management
  async updatePlan(address: string, plan: string, actorAddress?: string): Promise<CryptoIdentityRecord | undefined> {
    const [updated] = await db.update(cryptoIdentities)
      .set({ 
        plan,
        planStatus: plan === 'free' ? 'none' : 'active',
        planRenewalAt: plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      })
      .where(eq(cryptoIdentities.address, address))
      .returning();
    
    if (updated && actorAddress) {
      await this.createAuditLog({
        actorAddress,
        targetAddress: address,
        actionType: 'PLAN_CHANGE',
        metadata: { newPlan: plan }
      });
    }
    
    return updated || undefined;
  }

  // Invite links
  async getInviteLink(code: string): Promise<InviteLink | undefined> {
    const [link] = await db.select().from(inviteLinks).where(eq(inviteLinks.code, code));
    return link || undefined;
  }

  async getInviteLinkById(id: string): Promise<InviteLink | undefined> {
    const [link] = await db.select().from(inviteLinks).where(eq(inviteLinks.id, id));
    return link || undefined;
  }

  async getAllInviteLinks(createdByAddress?: string): Promise<InviteLink[]> {
    if (createdByAddress) {
      return db.select().from(inviteLinks)
        .where(eq(inviteLinks.createdByAddress, createdByAddress))
        .orderBy(desc(inviteLinks.createdAt));
    }
    return db.select().from(inviteLinks).orderBy(desc(inviteLinks.createdAt));
  }

  async getInviteLinksByCreator(creatorAddress: string): Promise<InviteLink[]> {
    return db.select().from(inviteLinks)
      .where(eq(inviteLinks.createdByAddress, creatorAddress))
      .orderBy(desc(inviteLinks.createdAt));
  }

  async createOrUpdateContact(ownerAddress: string, contactAddress: string, name: string): Promise<Contact> {
    // Check if contact already exists
    const [existing] = await db.select().from(contacts)
      .where(and(
        eq(contacts.ownerAddress, ownerAddress),
        eq(contacts.contactAddress, contactAddress)
      ));
    
    if (existing) {
      // Update existing contact name
      const [updated] = await db.update(contacts)
        .set({ name })
        .where(eq(contacts.id, existing.id))
        .returning();
      return updated;
    }
    
    // Create new contact
    const [created] = await db.insert(contacts).values({
      ownerAddress,
      contactAddress,
      name,
    }).returning();
    return created;
  }

  // Identity vault methods
  async getIdentityVault(publicKeyBase58: string): Promise<IdentityVault | undefined> {
    const [vault] = await db.select().from(identityVaults)
      .where(eq(identityVaults.publicKeyBase58, publicKeyBase58));
    return vault || undefined;
  }

  async createIdentityVault(vault: InsertIdentityVault): Promise<IdentityVault> {
    const [created] = await db.insert(identityVaults).values(vault).returning();
    return created;
  }

  async updateIdentityVault(publicKeyBase58: string, updates: Partial<IdentityVault>): Promise<IdentityVault | undefined> {
    const [updated] = await db.update(identityVaults)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(identityVaults.publicKeyBase58, publicKeyBase58))
      .returning();
    return updated || undefined;
  }

  // Vault access logging methods
  async logVaultAccess(log: InsertVaultAccessLog): Promise<VaultAccessLog> {
    const [created] = await db.insert(vaultAccessLogs).values(log).returning();
    return created;
  }

  async getRecentVaultAccessAttempts(publicKeyBase58: string, minutesAgo: number): Promise<VaultAccessLog[]> {
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    return db.select().from(vaultAccessLogs)
      .where(and(
        eq(vaultAccessLogs.publicKeyBase58, publicKeyBase58),
        gte(vaultAccessLogs.createdAt, cutoffTime)
      ))
      .orderBy(desc(vaultAccessLogs.createdAt));
  }

  async getVaultAccessesByIp(ipAddress: string, minutesAgo: number): Promise<VaultAccessLog[]> {
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
    return db.select().from(vaultAccessLogs)
      .where(and(
        eq(vaultAccessLogs.ipAddress, ipAddress),
        gte(vaultAccessLogs.createdAt, cutoffTime)
      ))
      .orderBy(desc(vaultAccessLogs.createdAt));
  }

  async createInviteLink(link: InsertInviteLink): Promise<InviteLink> {
    const [created] = await db.insert(inviteLinks).values(link).returning();
    return created;
  }

  async updateInviteLink(id: string, updates: Partial<InviteLink>): Promise<InviteLink | undefined> {
    const [updated] = await db.update(inviteLinks).set(updates).where(eq(inviteLinks.id, id)).returning();
    return updated || undefined;
  }

  async deleteInviteLink(id: string): Promise<boolean> {
    const result = await db.delete(inviteLinks).where(eq(inviteLinks.id, id));
    return true;
  }

  async redeemInviteLink(code: string, redeemerAddress: string): Promise<{ success: boolean; error?: string; link?: InviteLink }> {
    const link = await this.getInviteLink(code);
    
    if (!link) {
      return { success: false, error: 'Invite link not found' };
    }
    
    if (!link.isActive) {
      return { success: false, error: 'Invite link is no longer active' };
    }
    
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return { success: false, error: 'Invite link has expired' };
    }
    
    if (link.maxUses && link.uses !== null && link.uses >= link.maxUses) {
      return { success: false, error: 'Invite link has reached maximum uses' };
    }
    
    // Check if user already redeemed this link
    const [existingRedemption] = await db.select().from(inviteRedemptions)
      .where(and(
        eq(inviteRedemptions.inviteLinkId, link.id),
        eq(inviteRedemptions.redeemedByAddress, redeemerAddress)
      ));
    
    if (existingRedemption) {
      return { success: false, error: 'You have already redeemed this invite' };
    }
    
    // Record redemption
    await db.insert(inviteRedemptions).values({
      inviteLinkId: link.id,
      redeemedByAddress: redeemerAddress,
    });
    
    // Increment uses
    await db.update(inviteLinks)
      .set({ uses: (link.uses || 0) + 1 })
      .where(eq(inviteLinks.id, link.id));
    
    // Grant access based on invite type
    if (link.type === 'comp') {
      // Comp invites grant full plan access without billing
      await db.update(cryptoIdentities)
        .set({
          plan: link.grantPlan || 'pro',
          planStatus: 'active',
          isComped: true,
        })
        .where(eq(cryptoIdentities.address, redeemerAddress));
    } else {
      // Trial invites grant limited trial access
      const trialEndAt = link.trialDays ? new Date(Date.now() + link.trialDays * 24 * 60 * 60 * 1000) : null;
      await db.update(cryptoIdentities)
        .set({
          trialStatus: 'active',
          trialStartAt: new Date(),
          trialEndAt,
          trialMinutesRemaining: link.trialMinutes || 30,
          trialPlan: link.grantPlan || 'pro',
        })
        .where(eq(cryptoIdentities.address, redeemerAddress));
    }
    
    // Log the redemption
    await this.createAuditLog({
      actorAddress: redeemerAddress,
      targetAddress: redeemerAddress,
      actionType: 'INVITE_REDEEMED',
      metadata: { inviteCode: code, inviteLinkId: link.id, createdBy: link.createdByAddress }
    });
    
    return { success: true, link };
  }

  async getInviteRedemptions(inviteLinkId: string): Promise<InviteRedemption[]> {
    return db.select().from(inviteRedemptions)
      .where(eq(inviteRedemptions.inviteLinkId, inviteLinkId))
      .orderBy(desc(inviteRedemptions.redeemedAt));
  }

  // Entitlement helpers
  async canUseProFeatures(address: string): Promise<boolean> {
    const identity = await this.getIdentity(address);
    if (!identity) return false;
    
    // Check if user has active Pro or Business plan
    if (identity.plan === 'pro' || identity.plan === 'business' || identity.plan === 'enterprise') {
      if (identity.planStatus === 'active') return true;
    }
    
    // Check if user has active trial
    if (identity.trialStatus === 'active') {
      // Check time-based trial
      if (identity.trialEndAt && new Date(identity.trialEndAt) > new Date()) {
        return true;
      }
      // Check minute-based trial
      if (identity.trialMinutesRemaining && identity.trialMinutesRemaining > 0) {
        return true;
      }
    }
    
    return false;
  }

  async canUseBusinessFeatures(address: string): Promise<boolean> {
    const identity = await this.getIdentity(address);
    if (!identity) return false;
    
    // Check if user has active Business plan
    if (identity.plan === 'business' || identity.plan === 'enterprise') {
      if (identity.planStatus === 'active') return true;
    }
    
    // Check if user has active trial with business access
    if (identity.trialStatus === 'active' && identity.trialPlan === 'business') {
      // Check time-based trial
      if (identity.trialEndAt && new Date(identity.trialEndAt) > new Date()) {
        return true;
      }
      // Check minute-based trial
      if (identity.trialMinutesRemaining && identity.trialMinutesRemaining > 0) {
        return true;
      }
    }
    
    return false;
  }

  // Admin stats
  async getAdminStats(): Promise<{
    totalUsers: number;
    activeTrials: number;
    proPlans: number;
    businessPlans: number;
    disabledUsers: number;
    adminCount: number;
  }> {
    const allIdentities = await db.select().from(cryptoIdentities);
    
    const now = new Date();
    
    return {
      totalUsers: allIdentities.length,
      activeTrials: allIdentities.filter(i => 
        i.trialStatus === 'active' && 
        ((i.trialEndAt && new Date(i.trialEndAt) > now) || (i.trialMinutesRemaining && i.trialMinutesRemaining > 0))
      ).length,
      proPlans: allIdentities.filter(i => i.plan === 'pro' && i.planStatus === 'active').length,
      businessPlans: allIdentities.filter(i => i.plan === 'business' && i.planStatus === 'active').length,
      disabledUsers: allIdentities.filter(i => i.isDisabled).length,
      adminCount: allIdentities.filter(i => i.role === 'admin' || i.role === 'founder').length,
    };
  }

  // Crypto invoice methods
  async getCryptoInvoice(id: string): Promise<CryptoInvoice | undefined> {
    const [invoice] = await db.select().from(cryptoInvoices).where(eq(cryptoInvoices.id, id));
    return invoice || undefined;
  }

  async getCryptoInvoiceByTxHash(txHash: string): Promise<CryptoInvoice | undefined> {
    const [invoice] = await db.select().from(cryptoInvoices).where(eq(cryptoInvoices.txHash, txHash));
    return invoice || undefined;
  }

  async getCryptoInvoicesByPayToken(payTokenId: string): Promise<CryptoInvoice[]> {
    return db.select().from(cryptoInvoices).where(eq(cryptoInvoices.payTokenId, payTokenId)).orderBy(desc(cryptoInvoices.createdAt));
  }

  async createCryptoInvoice(invoice: InsertCryptoInvoice): Promise<CryptoInvoice> {
    const [created] = await db.insert(cryptoInvoices).values(invoice).returning();
    return created;
  }

  async updateCryptoInvoice(id: string, updates: Partial<CryptoInvoice>): Promise<CryptoInvoice | undefined> {
    const [updated] = await db.update(cryptoInvoices).set(updates).where(eq(cryptoInvoices.id, id)).returning();
    return updated || undefined;
  }

  async getRecentCryptoInvoices(limit: number = 50): Promise<CryptoInvoice[]> {
    return db.select().from(cryptoInvoices).orderBy(desc(cryptoInvoices.createdAt)).limit(limit);
  }

  async expireOldCryptoInvoices(): Promise<number> {
    const now = new Date();
    const result = await db.update(cryptoInvoices)
      .set({ status: 'expired' })
      .where(and(
        eq(cryptoInvoices.status, 'pending'),
        lte(cryptoInvoices.expiresAt, now)
      ))
      .returning();
    return result.length;
  }

  // Usage counter methods (Free Tier Cost Shield)
  private getDayKey(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private getMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  }

  async getUsageCounter(userAddress: string): Promise<UsageCounter | undefined> {
    const [counter] = await db.select().from(usageCounters).where(eq(usageCounters.userAddress, userAddress));
    return counter || undefined;
  }

  async getOrCreateUsageCounter(userAddress: string): Promise<UsageCounter> {
    const existing = await this.getUsageCounter(userAddress);
    const dayKey = this.getDayKey();
    const monthKey = this.getMonthKey();

    if (existing) {
      // Reset counters if day/month changed
      const updates: Partial<UsageCounter> = { updatedAt: new Date() };
      if (existing.dayKey !== dayKey) {
        updates.dayKey = dayKey;
        updates.callsStartedToday = 0;
        updates.failedStartsToday = 0;
        updates.callAttemptsHour = 0;
      }
      if (existing.monthKey !== monthKey) {
        updates.monthKey = monthKey;
        updates.secondsUsedMonth = 0;
      }
      if (Object.keys(updates).length > 1) {
        const [updated] = await db.update(usageCounters)
          .set(updates)
          .where(eq(usageCounters.userAddress, userAddress))
          .returning();
        return updated;
      }
      return existing;
    }

    const [created] = await db.insert(usageCounters).values({
      userAddress,
      dayKey,
      monthKey,
      callsStartedToday: 0,
      failedStartsToday: 0,
      callAttemptsHour: 0,
      secondsUsedMonth: 0,
      relayCalls24h: 0,
    }).returning();
    return created;
  }

  async updateUsageCounter(userAddress: string, updates: Partial<UsageCounter>): Promise<UsageCounter | undefined> {
    const [updated] = await db.update(usageCounters)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated || undefined;
  }

  async incrementCallsStarted(userAddress: string): Promise<UsageCounter> {
    const counter = await this.getOrCreateUsageCounter(userAddress);
    const [updated] = await db.update(usageCounters)
      .set({ 
        callsStartedToday: (counter.callsStartedToday || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated;
  }

  async incrementFailedStarts(userAddress: string): Promise<UsageCounter> {
    const counter = await this.getOrCreateUsageCounter(userAddress);
    const [updated] = await db.update(usageCounters)
      .set({ 
        failedStartsToday: (counter.failedStartsToday || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated;
  }

  async incrementCallAttempts(userAddress: string): Promise<UsageCounter> {
    const counter = await this.getOrCreateUsageCounter(userAddress);
    const currentHour = new Date().getHours();
    
    // Reset hourly counter if hour changed
    const attempts = counter.lastAttemptHour === currentHour 
      ? (counter.callAttemptsHour || 0) + 1 
      : 1;
    
    const [updated] = await db.update(usageCounters)
      .set({ 
        callAttemptsHour: attempts,
        lastAttemptHour: currentHour,
        updatedAt: new Date()
      })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated;
  }

  async addSecondsUsed(userAddress: string, seconds: number): Promise<UsageCounter> {
    const counter = await this.getOrCreateUsageCounter(userAddress);
    const [updated] = await db.update(usageCounters)
      .set({ 
        secondsUsedMonth: (counter.secondsUsedMonth || 0) + seconds,
        updatedAt: new Date()
      })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated;
  }

  async incrementRelayCalls(userAddress: string): Promise<UsageCounter> {
    const counter = await this.getOrCreateUsageCounter(userAddress);
    const [updated] = await db.update(usageCounters)
      .set({ 
        relayCalls24h: (counter.relayCalls24h || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(usageCounters.userAddress, userAddress))
      .returning();
    return updated;
  }

  // Active call methods
  async getActiveCall(callSessionId: string): Promise<ActiveCall | undefined> {
    const [call] = await db.select().from(activeCalls).where(eq(activeCalls.callSessionId, callSessionId));
    return call || undefined;
  }

  async getActiveCallsForUser(userAddress: string): Promise<ActiveCall[]> {
    return db.select().from(activeCalls).where(
      or(
        eq(activeCalls.callerAddress, userAddress),
        eq(activeCalls.calleeAddress, userAddress)
      )
    );
  }

  async createActiveCall(call: InsertActiveCall): Promise<ActiveCall> {
    const [created] = await db.insert(activeCalls).values(call).returning();
    return created;
  }

  async updateActiveCall(callSessionId: string, updates: Partial<ActiveCall>): Promise<ActiveCall | undefined> {
    const [updated] = await db.update(activeCalls)
      .set(updates)
      .where(eq(activeCalls.callSessionId, callSessionId))
      .returning();
    return updated || undefined;
  }

  async deleteActiveCall(callSessionId: string): Promise<boolean> {
    const result = await db.delete(activeCalls).where(eq(activeCalls.callSessionId, callSessionId)).returning();
    return result.length > 0;
  }

  async getAllActiveCalls(): Promise<ActiveCall[]> {
    return db.select().from(activeCalls);
  }

  async getStaleActiveCalls(heartbeatThresholdSeconds: number): Promise<ActiveCall[]> {
    const threshold = new Date(Date.now() - heartbeatThresholdSeconds * 1000);
    return db.select().from(activeCalls).where(
      and(
        or(
          lte(activeCalls.lastHeartbeatCaller, threshold),
          sql`${activeCalls.lastHeartbeatCaller} IS NULL`
        ),
        or(
          lte(activeCalls.lastHeartbeatCallee, threshold),
          sql`${activeCalls.lastHeartbeatCallee} IS NULL`
        )
      )
    );
  }

  // User tier management
  async getUserTier(address: string): Promise<'free' | 'paid' | 'admin'> {
    const identity = await this.getIdentity(address);
    if (!identity) {
      // Check if this is a linked address - inherit tier from primary
      const primaryAddress = await this.getPrimaryAddress(address);
      if (primaryAddress) {
        return this.getUserTier(primaryAddress);
      }
      return 'free';
    }
    
    // Admin/founder = admin tier
    if (identity.role === 'admin' || identity.role === 'founder' || 
        identity.role === 'super_admin' || identity.role === 'ultra_god_admin') {
      return 'admin';
    }
    
    // Check if linked to a primary with higher tier
    const primaryAddress = await this.getPrimaryAddress(address);
    if (primaryAddress) {
      const primaryTier = await this.getUserTier(primaryAddress);
      if (primaryTier === 'admin' || primaryTier === 'paid') {
        return primaryTier;
      }
    }
    
    // Comped account = paid tier (perpetual Pro without billing)
    if (identity.isComped) {
      return 'paid';
    }
    
    // Active subscription = paid tier
    if ((identity.plan === 'pro' || identity.plan === 'business' || identity.plan === 'enterprise') && 
        identity.planStatus === 'active') {
      return 'paid';
    }
    
    // Active trial = paid tier
    if (identity.trialStatus === 'active') {
      if (identity.trialEndAt && new Date(identity.trialEndAt) > new Date()) {
        return 'paid';
      }
      if (identity.trialMinutesRemaining && identity.trialMinutesRemaining > 0) {
        return 'paid';
      }
    }
    
    return 'free';
  }

  // Set/unset comped status
  async setCompedStatus(address: string, isComped: boolean, actorAddress: string): Promise<CryptoIdentityRecord | undefined> {
    const identity = await this.getIdentity(address);
    if (!identity) return undefined;

    const updated = await this.updateIdentity(address, { isComped } as any);
    
    await this.createAuditLog({
      actorAddress,
      targetAddress: address,
      actionType: isComped ? 'GRANT_COMPED' : 'REVOKE_COMPED',
      metadata: { isComped }
    });
    
    return updated;
  }

  // Get all usage counters for admin dashboard
  async getAllUsageCounters(limit: number = 100): Promise<UsageCounter[]> {
    return db.select().from(usageCounters).limit(limit).orderBy(sql`${usageCounters.updatedAt} DESC NULLS LAST`);
  }

  async setUserTier(address: string, tier: 'free' | 'paid' | 'admin', actorAddress: string): Promise<CryptoIdentityRecord | undefined> {
    const identity = await this.getIdentity(address);
    if (!identity) return undefined;

    let updates: Partial<InsertCryptoIdentity> = {};
    
    if (tier === 'admin') {
      updates = { role: 'admin' };
    } else if (tier === 'paid') {
      // Grant a perpetual pro plan
      updates = { plan: 'pro', planStatus: 'active' };
    } else {
      // Reset to free - but keep role unless it's admin
      updates = { plan: 'free', planStatus: 'none' };
    }

    const updated = await this.updateIdentity(address, updates);
    
    // Log the action
    await this.createAuditLog({
      actorAddress,
      targetAddress: address,
      actionType: 'TIER_CHANGE',
      metadata: { oldTier: await this.getUserTier(address), newTier: tier }
    });
    
    return updated;
  }

  // Freeze Mode methods
  async getAlwaysAllowedContacts(ownerAddress: string): Promise<Contact[]> {
    return db.select().from(contacts).where(
      and(eq(contacts.ownerAddress, ownerAddress), eq(contacts.alwaysAllowed, true))
    );
  }

  async isContactAlwaysAllowed(ownerAddress: string, contactAddress: string): Promise<boolean> {
    const [contact] = await db.select().from(contacts).where(
      and(
        eq(contacts.ownerAddress, ownerAddress),
        eq(contacts.contactAddress, contactAddress),
        eq(contacts.alwaysAllowed, true)
      )
    );
    return !!contact;
  }

  async setContactAlwaysAllowed(ownerAddress: string, contactAddress: string, alwaysAllowed: boolean): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(
      and(eq(contacts.ownerAddress, ownerAddress), eq(contacts.contactAddress, contactAddress))
    );
    if (!contact) return undefined;
    
    const [updated] = await db.update(contacts)
      .set({ alwaysAllowed })
      .where(eq(contacts.id, contact.id))
      .returning();
    return updated || undefined;
  }

  async getFreezeModeSetting(address: string): Promise<{ enabled: boolean; setupCompleted: boolean }> {
    const identity = await this.getIdentity(address);
    if (!identity) return { enabled: false, setupCompleted: false };
    return {
      enabled: identity.freezeMode || false,
      setupCompleted: identity.freezeModeSetupCompleted || false
    };
  }

  async setFreezeMode(address: string, enabled: boolean): Promise<CryptoIdentityRecord | undefined> {
    return this.updateIdentity(address, { freezeMode: enabled });
  }

  async setFreezeModeSetupCompleted(address: string): Promise<CryptoIdentityRecord | undefined> {
    return this.updateIdentity(address, { freezeModeSetupCompleted: true });
  }

  // Admin Permissions (RBAC) methods
  async getAdminPermissions(userAddress: string): Promise<AdminPermissions | undefined> {
    const [perms] = await db.select().from(adminPermissions).where(eq(adminPermissions.userAddress, userAddress));
    return perms || undefined;
  }

  async setAdminPermissions(data: InsertAdminPermissions): Promise<AdminPermissions> {
    const existing = await this.getAdminPermissions(data.userAddress);
    const permsArray: string[] = Array.isArray(data.permissions) ? [...data.permissions] : [];
    if (existing) {
      const [updated] = await db.update(adminPermissions)
        .set({ permissions: permsArray as string[], expiresAt: data.expiresAt, updatedAt: new Date() })
        .where(eq(adminPermissions.userAddress, data.userAddress))
        .returning();
      return updated;
    }
    const insertData: any = {
      userAddress: data.userAddress,
      permissions: permsArray as string[],
      expiresAt: data.expiresAt,
      grantedBy: data.grantedBy,
    };
    const [created] = await db.insert(adminPermissions).values(insertData).returning();
    return created;
  }

  async updateAdminPermissions(userAddress: string, permissions: string[], expiresAt?: Date): Promise<AdminPermissions | undefined> {
    const [updated] = await db.update(adminPermissions)
      .set({ permissions, expiresAt, updatedAt: new Date() })
      .where(eq(adminPermissions.userAddress, userAddress))
      .returning();
    return updated || undefined;
  }

  async deleteAdminPermissions(userAddress: string): Promise<boolean> {
    const result = await db.delete(adminPermissions).where(eq(adminPermissions.userAddress, userAddress)).returning();
    return result.length > 0;
  }

  // System Settings methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting || undefined;
  }

  async setSystemSetting(key: string, value: unknown, updatedBy: string, description?: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [updated] = await db.update(systemSettings)
        .set({ valueJson: value, updatedBy, updatedAt: new Date(), description })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values({ key, valueJson: value, updatedBy, description }).returning();
    return created;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  // Promo Codes methods
  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
    return promo || undefined;
  }

  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [created] = await db.insert(promoCodes).values(data).returning();
    return created;
  }

  async updatePromoCode(id: string, updates: Partial<PromoCode>): Promise<PromoCode | undefined> {
    const [updated] = await db.update(promoCodes).set(updates).where(eq(promoCodes.id, id)).returning();
    return updated || undefined;
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }

  // IP Blocklist methods
  async getBlockedIp(ipAddress: string): Promise<IpBlocklistEntry | undefined> {
    const [entry] = await db.select().from(ipBlocklist).where(eq(ipBlocklist.ipAddress, ipAddress));
    return entry || undefined;
  }

  async blockIp(ipAddress: string, reason: string, blockedBy: string, expiresAt?: Date): Promise<IpBlocklistEntry> {
    const [created] = await db.insert(ipBlocklist).values({ ipAddress, reason, blockedBy, expiresAt }).returning();
    return created;
  }

  async unblockIp(ipAddress: string): Promise<boolean> {
    const result = await db.delete(ipBlocklist).where(eq(ipBlocklist.ipAddress, ipAddress)).returning();
    return result.length > 0;
  }

  async getAllBlockedIps(): Promise<IpBlocklistEntry[]> {
    return db.select().from(ipBlocklist);
  }

  // Admin Sessions methods
  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> {
    const [session] = await db.select().from(adminSessions).where(
      and(eq(adminSessions.sessionToken, sessionToken), sql`${adminSessions.revokedAt} IS NULL`)
    );
    return session || undefined;
  }

  async getAdminSessionsForUser(adminAddress: string): Promise<AdminSession[]> {
    return db.select().from(adminSessions).where(
      and(eq(adminSessions.adminAddress, adminAddress), sql`${adminSessions.revokedAt} IS NULL`)
    );
  }

  async createAdminSession(adminAddress: string, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const [created] = await db.insert(adminSessions).values({
      adminAddress,
      sessionToken,
      ipAddress,
      userAgent,
      expiresAt,
    }).returning();
    return created;
  }

  async revokeAdminSession(sessionToken: string): Promise<boolean> {
    const result = await db.update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.sessionToken, sessionToken))
      .returning();
    return result.length > 0;
  }

  async revokeAllAdminSessions(adminAddress: string): Promise<number> {
    const result = await db.update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.adminAddress, adminAddress), sql`${adminSessions.revokedAt} IS NULL`))
      .returning();
    return result.length;
  }

  // Extended user management methods
  async suspendUser(address: string, reason: string, suspendedBy: string): Promise<CryptoIdentityRecord | undefined> {
    return this.updateIdentity(address, {
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedBy,
      suspendedReason: reason,
    } as any);
  }

  async unsuspendUser(address: string): Promise<CryptoIdentityRecord | undefined> {
    return this.updateIdentity(address, {
      status: 'active',
      suspendedAt: null,
      suspendedBy: null,
      suspendedReason: null,
    } as any);
  }

  async softBanUser(address: string, reason: string, bannedBy: string): Promise<CryptoIdentityRecord | undefined> {
    return this.updateIdentity(address, {
      status: 'soft_banned',
      suspendedAt: new Date(),
      suspendedBy: bannedBy,
      suspendedReason: reason,
    } as any);
  }

  async grantFreeAccess(address: string, endAt: Date, actorAddress: string): Promise<CryptoIdentityRecord | undefined> {
    const updated = await this.updateIdentity(address, { freeAccessEndAt: endAt } as any);
    await this.createAuditLog({
      actorAddress,
      targetAddress: address,
      actionType: 'GRANT_FREE_ACCESS',
      metadata: { freeAccessEndAt: endAt.toISOString() }
    });
    return updated;
  }

  // Admin Credentials implementation
  async getAdminCredentialsByUsername(username: string): Promise<AdminCredentials | undefined> {
    const [creds] = await db.select().from(adminCredentials).where(eq(adminCredentials.username, username));
    return creds || undefined;
  }

  async getAdminCredentialsByAddress(address: string): Promise<AdminCredentials | undefined> {
    const [creds] = await db.select().from(adminCredentials).where(eq(adminCredentials.address, address));
    return creds || undefined;
  }

  async createAdminCredentials(creds: InsertAdminCredentials): Promise<AdminCredentials> {
    const [created] = await db.insert(adminCredentials).values(creds).returning();
    return created;
  }

  async updateAdminCredentials(address: string, updates: Partial<AdminCredentials>): Promise<AdminCredentials | undefined> {
    const [updated] = await db.update(adminCredentials)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(adminCredentials.address, address))
      .returning();
    return updated || undefined;
  }

  async incrementFailedLoginAttempts(address: string): Promise<AdminCredentials | undefined> {
    const [updated] = await db.update(adminCredentials)
      .set({ failedLoginAttempts: sql`${adminCredentials.failedLoginAttempts} + 1` })
      .where(eq(adminCredentials.address, address))
      .returning();
    return updated || undefined;
  }

  async resetFailedLoginAttempts(address: string): Promise<AdminCredentials | undefined> {
    const [updated] = await db.update(adminCredentials)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(adminCredentials.address, address))
      .returning();
    return updated || undefined;
  }

  async lockAdminAccount(address: string, untilDate: Date): Promise<AdminCredentials | undefined> {
    const [updated] = await db.update(adminCredentials)
      .set({ lockedUntil: untilDate })
      .where(eq(adminCredentials.address, address))
      .returning();
    return updated || undefined;
  }

  // Voicemail implementation
  async getVoicemails(recipientAddress: string): Promise<Voicemail[]> {
    return db.select().from(voicemails)
      .where(and(
        eq(voicemails.recipientAddress, recipientAddress),
        sql`${voicemails.deletedAt} IS NULL`
      ))
      .orderBy(desc(voicemails.createdAt));
  }

  async getVoicemail(id: string): Promise<Voicemail | undefined> {
    const [voicemail] = await db.select().from(voicemails).where(eq(voicemails.id, id));
    return voicemail || undefined;
  }

  async createVoicemail(voicemail: InsertVoicemail): Promise<Voicemail> {
    const [created] = await db.insert(voicemails).values(voicemail).returning();
    return created;
  }

  async updateVoicemail(id: string, updates: Partial<Voicemail>): Promise<Voicemail | undefined> {
    const [updated] = await db.update(voicemails).set(updates).where(eq(voicemails.id, id)).returning();
    return updated || undefined;
  }

  async markVoicemailRead(id: string): Promise<Voicemail | undefined> {
    const [updated] = await db.update(voicemails)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(voicemails.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteVoicemail(id: string): Promise<boolean> {
    const [deleted] = await db.update(voicemails)
      .set({ deletedAt: new Date() })
      .where(eq(voicemails.id, id))
      .returning();
    return !!deleted;
  }

  async getUnreadVoicemailCount(recipientAddress: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(voicemails)
      .where(and(
        eq(voicemails.recipientAddress, recipientAddress),
        eq(voicemails.isRead, false),
        sql`${voicemails.deletedAt} IS NULL`
      ));
    return Number(result?.count || 0);
  }

  // Linked Addresses implementation
  async getLinkedAddresses(primaryAddress: string): Promise<LinkedAddress[]> {
    return await db.select().from(linkedAddresses)
      .where(eq(linkedAddresses.primaryAddress, primaryAddress))
      .orderBy(desc(linkedAddresses.createdAt));
  }

  async getPrimaryAddress(linkedAddress: string): Promise<string | undefined> {
    const [link] = await db.select().from(linkedAddresses)
      .where(eq(linkedAddresses.linkedAddress, linkedAddress));
    return link?.primaryAddress;
  }

  async linkAddress(primaryAddress: string, linkedAddr: string, linkedPublicKey: string, label?: string): Promise<LinkedAddress> {
    const [created] = await db.insert(linkedAddresses).values({
      primaryAddress,
      linkedAddress: linkedAddr,
      linkedPublicKey,
      label: label || null,
    }).returning();
    return created;
  }

  async unlinkAddress(linkedAddr: string): Promise<boolean> {
    const [deleted] = await db.delete(linkedAddresses)
      .where(eq(linkedAddresses.linkedAddress, linkedAddr))
      .returning();
    return !!deleted;
  }
  
  async updateLinkedAddressLabel(linkedAddr: string, label: string): Promise<LinkedAddress | undefined> {
    const [updated] = await db.update(linkedAddresses)
      .set({ label })
      .where(eq(linkedAddresses.linkedAddress, linkedAddr))
      .returning();
    return updated || undefined;
  }

  async isAddressLinked(address: string): Promise<boolean> {
    const [link] = await db.select().from(linkedAddresses)
      .where(eq(linkedAddresses.linkedAddress, address));
    return !!link;
  }
  
  // Call ID Settings implementation
  async getCallIdSettings(callIdAddress: string): Promise<CallIdSettings | undefined> {
    const [settings] = await db.select().from(callIdSettings)
      .where(eq(callIdSettings.callIdAddress, callIdAddress));
    return settings || undefined;
  }
  
  async ensureCallIdSettings(callIdAddress: string, ownerAddress: string): Promise<CallIdSettings> {
    const existing = await this.getCallIdSettings(callIdAddress);
    if (existing) return existing;
    
    const [created] = await db.insert(callIdSettings)
      .values({ callIdAddress, ownerAddress })
      .returning();
    return created;
  }
  
  async updateCallIdSettings(callIdAddress: string, updates: Partial<InsertCallIdSettings>): Promise<CallIdSettings | undefined> {
    const [updated] = await db.update(callIdSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(callIdSettings.callIdAddress, callIdAddress))
      .returning();
    return updated || undefined;
  }
  
  async getAllCallIdSettings(ownerAddress: string): Promise<CallIdSettings[]> {
    return db.select().from(callIdSettings)
      .where(eq(callIdSettings.ownerAddress, ownerAddress));
  }

  // Push subscriptions implementation
  async savePushSubscription(userAddress: string, endpoint: string, p256dhKey: string, authKey: string): Promise<void> {
    // Upsert - update if endpoint exists, otherwise insert
    const existing = await db.select().from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userAddress, userAddress),
        eq(pushSubscriptions.endpoint, endpoint)
      ));
    
    if (existing.length > 0) {
      await db.update(pushSubscriptions)
        .set({ p256dhKey, authKey, updatedAt: new Date() })
        .where(and(
          eq(pushSubscriptions.userAddress, userAddress),
          eq(pushSubscriptions.endpoint, endpoint)
        ));
    } else {
      await db.insert(pushSubscriptions).values({
        userAddress,
        endpoint,
        p256dhKey,
        authKey,
      });
    }
  }

  async getPushSubscriptions(userAddress: string): Promise<{ endpoint: string; p256dhKey: string; authKey: string }[]> {
    const subs = await db.select({
      endpoint: pushSubscriptions.endpoint,
      p256dhKey: pushSubscriptions.p256dhKey,
      authKey: pushSubscriptions.authKey,
    }).from(pushSubscriptions)
      .where(eq(pushSubscriptions.userAddress, userAddress));
    return subs;
  }

  async deletePushSubscription(userAddress: string, endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userAddress, userAddress),
        eq(pushSubscriptions.endpoint, endpoint)
      ));
  }

  async deleteAllPushSubscriptions(userAddress: string): Promise<number> {
    const result = await db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userAddress, userAddress))
      .returning();
    return result.length;
  }

  async getPushSubscriptionStats(): Promise<{ totalSubscriptions: number; uniqueUsers: number }> {
    const totalResult = await db.select({ count: sql<number>`count(*)::int` }).from(pushSubscriptions);
    const usersResult = await db.select({ count: sql<number>`count(distinct user_address)::int` }).from(pushSubscriptions);
    return {
      totalSubscriptions: totalResult[0]?.count || 0,
      uniqueUsers: usersResult[0]?.count || 0
    };
  }

  async getAllPushSubscriptionsWithUsers(limit: number = 100): Promise<{ userAddress: string; endpoint: string; createdAt: Date }[]> {
    const results = await db.select({
      userAddress: pushSubscriptions.userAddress,
      endpoint: pushSubscriptions.endpoint,
      createdAt: pushSubscriptions.createdAt
    })
      .from(pushSubscriptions)
      .orderBy(desc(pushSubscriptions.createdAt))
      .limit(limit);
    return results;
  }

  // Native device push tokens (FCM/APNs) implementation
  async saveDevicePushToken(userAddress: string, platform: string, token: string, deviceInfo?: string, appVersion?: string): Promise<void> {
    const existing = await db.select().from(devicePushTokens)
      .where(and(
        eq(devicePushTokens.userAddress, userAddress),
        eq(devicePushTokens.token, token)
      ));
    
    if (existing.length > 0) {
      await db.update(devicePushTokens)
        .set({ platform, deviceInfo: deviceInfo || null, appVersion: appVersion || null, updatedAt: new Date() })
        .where(and(
          eq(devicePushTokens.userAddress, userAddress),
          eq(devicePushTokens.token, token)
        ));
    } else {
      await db.insert(devicePushTokens).values({
        userAddress,
        platform,
        token,
        deviceInfo: deviceInfo || null,
        appVersion: appVersion || null,
      });
    }
  }

  async getDevicePushTokens(userAddress: string): Promise<{ platform: string; token: string; deviceInfo: string | null; appVersion: string | null }[]> {
    const tokens = await db.select({
      platform: devicePushTokens.platform,
      token: devicePushTokens.token,
      deviceInfo: devicePushTokens.deviceInfo,
      appVersion: devicePushTokens.appVersion,
    }).from(devicePushTokens)
      .where(eq(devicePushTokens.userAddress, userAddress));
    return tokens;
  }

  async deleteDevicePushToken(userAddress: string, token: string): Promise<void> {
    await db.delete(devicePushTokens)
      .where(and(
        eq(devicePushTokens.userAddress, userAddress),
        eq(devicePushTokens.token, token)
      ));
  }

  async deleteAllDevicePushTokens(userAddress: string): Promise<number> {
    const result = await db.delete(devicePushTokens)
      .where(eq(devicePushTokens.userAddress, userAddress))
      .returning();
    return result.length;
  }

  async updateDevicePushTokenStatus(token: string, success: boolean, error?: string): Promise<void> {
    const updates: any = { updatedAt: new Date() };
    if (success) {
      updates.lastSuccessAt = new Date();
      updates.lastError = null;
    } else if (error) {
      updates.lastError = error;
    }
    await db.update(devicePushTokens)
      .set(updates)
      .where(eq(devicePushTokens.token, token));
  }

  async getAllDevicePushTokensForUsers(userAddresses: string[]): Promise<{ userAddress: string; platform: string; token: string }[]> {
    if (userAddresses.length === 0) return [];
    
    const tokens = await db.select({
      userAddress: devicePushTokens.userAddress,
      platform: devicePushTokens.platform,
      token: devicePushTokens.token,
    }).from(devicePushTokens)
      .where(sql`${devicePushTokens.userAddress} = ANY(${userAddresses})`);
    return tokens;
  }

  // Token metrics implementation
  async recordTokenMetric(eventType: string, userAddress?: string, userAgent?: string, ipAddress?: string, details?: string): Promise<void> {
    await db.insert(tokenMetrics).values({
      eventType,
      userAddress: userAddress || null,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      details: details || null,
    });
  }

  async getTokenMetrics(since: Date, eventType?: string): Promise<{ eventType: string; count: number }[]> {
    const conditions = [gte(tokenMetrics.createdAt, since)];
    if (eventType) {
      conditions.push(eq(tokenMetrics.eventType, eventType));
    }
    
    const results = await db.select({
      eventType: tokenMetrics.eventType,
      count: sql<number>`count(*)::int`
    })
      .from(tokenMetrics)
      .where(and(...conditions))
      .groupBy(tokenMetrics.eventType);
    
    return results;
  }

  async getTokenLogs(since: Date, limit: number = 100): Promise<{ id: string; eventType: string; userAddress: string | null; ipAddress: string | null; details: string | null; createdAt: Date }[]> {
    const results = await db.select({
      id: tokenMetrics.id,
      eventType: tokenMetrics.eventType,
      userAddress: tokenMetrics.userAddress,
      ipAddress: tokenMetrics.ipAddress,
      details: tokenMetrics.details,
      createdAt: tokenMetrics.createdAt
    })
      .from(tokenMetrics)
      .where(gte(tokenMetrics.createdAt, since))
      .orderBy(desc(tokenMetrics.createdAt))
      .limit(limit);
    
    return results;
  }

  // Call token nonces implementation
  async createCallToken(
    userAddress: string, 
    targetAddress?: string, 
    plan: string = 'free', 
    allowTurn: boolean = false, 
    allowVideo: boolean = true
  ): Promise<{ token: string; nonce: string; issuedAt: Date; expiresAt: Date }> {
    const token = randomUUID();
    const nonce = randomUUID();
    const nonceHash = createHash('sha256').update(nonce).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes TTL

    await db.insert(callTokenNonces).values({
      token,
      nonceHash,
      userAddress,
      targetAddress: targetAddress || null,
      plan,
      allowTurn,
      allowVideo,
      issuedAt: now,
      expiresAt,
    });

    return { token, nonce, issuedAt: now, expiresAt };
  }

  async verifyCallToken(
    token: string, 
    markUsed: boolean = true, 
    usedByIp?: string
  ): Promise<{ valid: boolean; reason?: string; data?: { userAddress: string; plan: string; allowTurn: boolean; allowVideo: boolean } }> {
    const [tokenRecord] = await db.select().from(callTokenNonces).where(eq(callTokenNonces.token, token));

    if (!tokenRecord) {
      return { valid: false, reason: 'token_not_found' };
    }

    const now = new Date();

    // Check if expired
    if (tokenRecord.expiresAt < now) {
      return { valid: false, reason: 'token_expired' };
    }

    // Check if already used (replay protection)
    if (tokenRecord.usedAt) {
      return { valid: false, reason: 'token_replay' };
    }

    // Mark as used atomically if requested
    if (markUsed) {
      const [updated] = await db.update(callTokenNonces)
        .set({ usedAt: now, usedByIp: usedByIp || null })
        .where(and(
          eq(callTokenNonces.token, token),
          sql`${callTokenNonces.usedAt} IS NULL` // Atomic check
        ))
        .returning();

      if (!updated) {
        // Another request already used this token (race condition)
        return { valid: false, reason: 'token_replay' };
      }
    }

    return {
      valid: true,
      data: {
        userAddress: tokenRecord.userAddress,
        plan: tokenRecord.plan,
        allowTurn: tokenRecord.allowTurn || false,
        allowVideo: tokenRecord.allowVideo !== false,
      }
    };
  }

  async cleanupExpiredCallTokens(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.delete(callTokenNonces)
      .where(lte(callTokenNonces.expiresAt, oneDayAgo))
      .returning();
    return result.length;
  }

  async storeMessage(
    fromAddress: string, 
    toAddress: string, 
    convoId: string, 
    content: string, 
    mediaType?: string, 
    mediaUrl?: string
  ): Promise<{ id: string; createdAt: Date }> {
    const [msg] = await db.insert(persistentMessages).values({
      fromAddress,
      toAddress,
      convoId,
      content,
      mediaType: mediaType || 'text',
      mediaUrl: mediaUrl || null,
      status: 'pending',
    }).returning();
    return { id: msg.id, createdAt: msg.createdAt };
  }

  async getPendingMessages(toAddress: string): Promise<{ id: string; fromAddress: string; toAddress: string; convoId: string; content: string; mediaType: string | null; mediaUrl: string | null; createdAt: Date }[]> {
    return db.select({
      id: persistentMessages.id,
      fromAddress: persistentMessages.fromAddress,
      toAddress: persistentMessages.toAddress,
      convoId: persistentMessages.convoId,
      content: persistentMessages.content,
      mediaType: persistentMessages.mediaType,
      mediaUrl: persistentMessages.mediaUrl,
      createdAt: persistentMessages.createdAt,
    }).from(persistentMessages).where(
      and(
        eq(persistentMessages.toAddress, toAddress),
        eq(persistentMessages.status, 'pending')
      )
    ).orderBy(asc(persistentMessages.createdAt));
  }

  async markMessageDelivered(messageId: string): Promise<void> {
    await db.update(persistentMessages)
      .set({ status: 'delivered', deliveredAt: new Date() })
      .where(eq(persistentMessages.id, messageId));
  }

  async markMessageRead(messageId: string): Promise<void> {
    await db.update(persistentMessages)
      .set({ status: 'read', readAt: new Date() })
      .where(eq(persistentMessages.id, messageId));
  }

  // Store message with server-assigned seq and timestamp (WhatsApp-like reliability)
  // Uses optimistic insert with unique constraint (convo_id, seq) and retry on conflict
  async storeMessageWithSeq(
    fromAddress: string,
    toAddress: string,
    convoId: string,
    content: string,
    options?: { 
      mediaType?: string; 
      mediaUrl?: string; 
      nonce?: string; 
      messageType?: string;
      attachmentName?: string;
      attachmentSize?: number;
    }
  ): Promise<{ id: string; seq: number; serverTimestamp: Date; createdAt: Date }> {
    const serverTimestamp = new Date();
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use advisory lock for the conversation to ensure sequential access
        // pg_advisory_xact_lock uses the hash of convo_id as the lock key
        const result = await db.execute(sql`
          SELECT pg_advisory_xact_lock(hashtext(${convoId}));
          INSERT INTO persistent_messages (
            from_address, to_address, convo_id, content, media_type, media_url, 
            status, seq, server_timestamp, nonce, message_type, attachment_name, attachment_size
          )
          VALUES (
            ${fromAddress}, ${toAddress}, ${convoId}, ${content}, 
            ${options?.mediaType || 'text'}, ${options?.mediaUrl || null},
            'pending',
            COALESCE((SELECT MAX(seq) FROM persistent_messages WHERE convo_id = ${convoId}), 0) + 1,
            ${serverTimestamp}, ${options?.nonce || null}, ${options?.messageType || 'text'},
            ${options?.attachmentName || null}, ${options?.attachmentSize || null}
          )
          RETURNING id, seq, server_timestamp, created_at
        `) as any;
        
        const row = (result as any).rows?.[0] || result;
        return { 
          id: row.id, 
          seq: row.seq, 
          serverTimestamp: row.server_timestamp || serverTimestamp, 
          createdAt: row.created_at || serverTimestamp 
        };
      } catch (error: any) {
        // Retry on unique constraint violation (race condition)
        if (error.code === '23505' && attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.random() * 50));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Failed to assign seq after max retries');
  }

  // Get messages since a specific seq for cross-device sync
  async getMessagesSinceSeq(convoId: string, sinceSeq: number, limit: number = 100): Promise<PersistentMessage[]> {
    return db.select()
      .from(persistentMessages)
      .where(and(
        eq(persistentMessages.convoId, convoId),
        gt(persistentMessages.seq, sinceSeq)
      ))
      .orderBy(asc(persistentMessages.seq))
      .limit(limit);
  }

  // Get latest seq for a conversation
  async getLatestSeq(convoId: string): Promise<number> {
    const [result] = await db.select({ maxSeq: sql<number>`COALESCE(MAX(${persistentMessages.seq}), 0)` })
      .from(persistentMessages)
      .where(eq(persistentMessages.convoId, convoId));
    return result?.maxSeq || 0;
  }

  // Get all conversations for a user with latest seq
  async getConversationsWithSeq(userAddress: string): Promise<{ convoId: string; latestSeq: number; lastMessage: string | null; lastMessageAt: Date | null }[]> {
    // Get all unique conversations for this user
    const convos = await db.selectDistinct({ convoId: persistentMessages.convoId })
      .from(persistentMessages)
      .where(or(
        eq(persistentMessages.fromAddress, userAddress),
        eq(persistentMessages.toAddress, userAddress)
      ));
    
    // For each conversation, get latest seq and last message
    const result = await Promise.all(convos.map(async ({ convoId }) => {
      const latestSeq = await this.getLatestSeq(convoId);
      const [lastMsg] = await db.select({ content: persistentMessages.content, createdAt: persistentMessages.createdAt })
        .from(persistentMessages)
        .where(eq(persistentMessages.convoId, convoId))
        .orderBy(desc(persistentMessages.createdAt))
        .limit(1);
      return {
        convoId,
        latestSeq,
        lastMessage: lastMsg?.content || null,
        lastMessageAt: lastMsg?.createdAt || null,
      };
    }));
    return result;
  }

  // Call Rooms (group calls)
  async createCallRoom(hostAddress: string, isVideo: boolean, name?: string, maxParticipants: number = 10): Promise<{ id: string; roomCode: string }> {
    const roomCode = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const [room] = await db.insert(callRooms).values({
      roomCode,
      hostAddress,
      name: name || null,
      isVideo,
      maxParticipants,
      status: 'active',
    }).returning();
    return { id: room.id, roomCode: room.roomCode };
  }

  async getCallRoom(roomId: string): Promise<{ id: string; roomCode: string; hostAddress: string; name: string | null; isVideo: boolean; isLocked: boolean; maxParticipants: number; status: string; createdAt: Date } | undefined> {
    const [room] = await db.select({
      id: callRooms.id,
      roomCode: callRooms.roomCode,
      hostAddress: callRooms.hostAddress,
      name: callRooms.name,
      isVideo: callRooms.isVideo,
      isLocked: callRooms.isLocked,
      maxParticipants: callRooms.maxParticipants,
      status: callRooms.status,
      createdAt: callRooms.createdAt,
    }).from(callRooms).where(eq(callRooms.id, roomId));
    return room ? { ...room, isVideo: room.isVideo ?? true, isLocked: room.isLocked ?? false } : undefined;
  }

  async getCallRoomByCode(roomCode: string): Promise<{ id: string; roomCode: string; hostAddress: string; name: string | null; isVideo: boolean; isLocked: boolean; maxParticipants: number; status: string; createdAt: Date } | undefined> {
    const [room] = await db.select({
      id: callRooms.id,
      roomCode: callRooms.roomCode,
      hostAddress: callRooms.hostAddress,
      name: callRooms.name,
      isVideo: callRooms.isVideo,
      isLocked: callRooms.isLocked,
      maxParticipants: callRooms.maxParticipants,
      status: callRooms.status,
      createdAt: callRooms.createdAt,
    }).from(callRooms).where(eq(callRooms.roomCode, roomCode));
    return room ? { ...room, isVideo: room.isVideo ?? true, isLocked: room.isLocked ?? false } : undefined;
  }

  async updateCallRoom(roomId: string, updates: { isLocked?: boolean; status?: string; endedAt?: Date }): Promise<void> {
    await db.update(callRooms).set(updates).where(eq(callRooms.id, roomId));
  }

  async addRoomParticipant(roomId: string, userAddress: string, displayName?: string, isHost: boolean = false): Promise<{ id: string }> {
    const [participant] = await db.insert(callRoomParticipants).values({
      roomId,
      userAddress,
      displayName: displayName || null,
      isHost,
    }).returning();
    return { id: participant.id };
  }

  async removeRoomParticipant(roomId: string, userAddress: string): Promise<void> {
    await db.update(callRoomParticipants)
      .set({ leftAt: new Date() })
      .where(and(
        eq(callRoomParticipants.roomId, roomId),
        eq(callRoomParticipants.userAddress, userAddress),
        sql`${callRoomParticipants.leftAt} IS NULL`
      ));
  }

  async getRoomParticipants(roomId: string): Promise<{ userAddress: string; displayName: string | null; isHost: boolean; isMuted: boolean; isVideoOff: boolean; joinedAt: Date }[]> {
    const participants = await db.select({
      userAddress: callRoomParticipants.userAddress,
      displayName: callRoomParticipants.displayName,
      isHost: callRoomParticipants.isHost,
      isMuted: callRoomParticipants.isMuted,
      isVideoOff: callRoomParticipants.isVideoOff,
      joinedAt: callRoomParticipants.joinedAt,
    }).from(callRoomParticipants).where(
      and(
        eq(callRoomParticipants.roomId, roomId),
        sql`${callRoomParticipants.leftAt} IS NULL`
      )
    );
    return participants.map(p => ({
      ...p,
      isHost: p.isHost ?? false,
      isMuted: p.isMuted ?? false,
      isVideoOff: p.isVideoOff ?? false,
    }));
  }

  async getRoomParticipantCount(roomId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(callRoomParticipants)
      .where(and(
        eq(callRoomParticipants.roomId, roomId),
        sql`${callRoomParticipants.leftAt} IS NULL`
      ));
    return result?.count || 0;
  }

  async isUserInRoom(roomId: string, userAddress: string): Promise<boolean> {
    const [participant] = await db.select({ id: callRoomParticipants.id })
      .from(callRoomParticipants)
      .where(and(
        eq(callRoomParticipants.roomId, roomId),
        eq(callRoomParticipants.userAddress, userAddress),
        sql`${callRoomParticipants.leftAt} IS NULL`
      ));
    return !!participant;
  }

  async updateParticipantMedia(roomId: string, userAddress: string, updates: { isMuted?: boolean; isVideoOff?: boolean }): Promise<void> {
    await db.update(callRoomParticipants)
      .set(updates)
      .where(and(
        eq(callRoomParticipants.roomId, roomId),
        eq(callRoomParticipants.userAddress, userAddress),
        sql`${callRoomParticipants.leftAt} IS NULL`
      ));
  }

  // User Mode Settings
  async getUserModeSettings(userAddress: string): Promise<UserModeSettings | undefined> {
    const [settings] = await db.select().from(userModeSettings)
      .where(eq(userModeSettings.userAddress, userAddress));
    return settings || undefined;
  }

  async createOrUpdateUserModeSettings(userAddress: string, mode: UserMode, flags?: Partial<FeatureFlags>): Promise<UserModeSettings> {
    const existing = await this.getUserModeSettings(userAddress);
    if (existing) {
      const [updated] = await db.update(userModeSettings)
        .set({ mode, flags: flags || existing.flags, updatedAt: new Date() })
        .where(eq(userModeSettings.userAddress, userAddress))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userModeSettings)
        .values({ userAddress, mode, flags: flags || {} })
        .returning();
      return created;
    }
  }

  async ensureUserModeSettings(userAddress: string): Promise<UserModeSettings> {
    const existing = await this.getUserModeSettings(userAddress);
    if (existing) return existing;
    const [created] = await db.insert(userModeSettings)
      .values({ userAddress, mode: 'personal', flags: {} })
      .returning();
    return created;
  }

  // Update user mode with atomic plan validation (prevents race conditions)
  // Uses single SQL query with JOIN to ensure plan hasn't changed during update
  async updateUserModeWithPlanValidation(userAddress: string, mode: UserMode, expectedPlan: string): Promise<UserModeSettings | null> {
    // Import plan validation logic
    const { getAvailableModesForPlan } = await import('./entitlements');
    
    const availableModes = getAvailableModesForPlan(expectedPlan);
    if (!availableModes.includes(mode)) {
      return null; // Mode not allowed for plan
    }
    
    // Atomic upsert: only succeeds if identity.plan matches expectedPlan
    // First ensure mode settings row exists
    const existing = await this.getUserModeSettings(userAddress);
    
    if (existing) {
      // Update only if plan matches (atomic check)
      const result = await db.execute(sql`
        UPDATE ${userModeSettings} 
        SET mode = ${mode}, "updatedAt" = NOW()
        WHERE "userAddress" = ${userAddress}
        AND EXISTS (
          SELECT 1 FROM ${cryptoIdentities}
          WHERE address = ${userAddress} AND plan = ${expectedPlan}
        )
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return null; // Plan changed, reject
      }
      
      return this.getUserModeSettings(userAddress) || null;
    } else {
      // Insert only if plan matches (atomic check)
      const result = await db.execute(sql`
        INSERT INTO ${userModeSettings} ("userAddress", mode, flags)
        SELECT ${userAddress}, ${mode}, '{}'::jsonb
        WHERE EXISTS (
          SELECT 1 FROM ${cryptoIdentities}
          WHERE address = ${userAddress} AND plan = ${expectedPlan}
        )
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return null; // Plan changed or user doesn't exist
      }
      
      return this.getUserModeSettings(userAddress) || null;
    }
  }

  // Plan Entitlements
  async getPlanEntitlements(planId: string): Promise<PlanEntitlements | undefined> {
    const [entitlements] = await db.select().from(planEntitlements)
      .where(eq(planEntitlements.planId, planId));
    return entitlements || undefined;
  }

  async getAllPlanEntitlements(): Promise<PlanEntitlements[]> {
    return db.select().from(planEntitlements).orderBy(asc(planEntitlements.planId));
  }

  async createOrUpdatePlanEntitlements(planId: string, entitlements: Partial<InsertPlanEntitlements>): Promise<PlanEntitlements> {
    const existing = await this.getPlanEntitlements(planId);
    if (existing) {
      const [updated] = await db.update(planEntitlements)
        .set({ ...entitlements, updatedAt: new Date() })
        .where(eq(planEntitlements.planId, planId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(planEntitlements)
        .values({ planId, ...entitlements })
        .returning();
      return created;
    }
  }

  async initDefaultPlanEntitlements(): Promise<void> {
    const defaults: { planId: string; data: Partial<InsertPlanEntitlements> }[] = [
      {
        planId: 'free',
        data: {
          maxCallIds: 1,
          maxGroupParticipants: 0,
          allowCallWaiting: false,
          allowCallMerge: false,
          allowPaidCalls: false,
          allowRoutingRules: false,
          allowDelegation: false,
          allowStageRooms: false,
          allowRecording: false,
          allowGroupCalls: false,
          maxCallMinutesPerMonth: 30,
          maxCallsPerDay: 2,
          maxCallDurationMinutes: 10,
        }
      },
      {
        planId: 'pro',
        data: {
          maxCallIds: 2,
          maxGroupParticipants: 6,
          allowCallWaiting: true,
          allowCallMerge: true,
          allowPaidCalls: true,
          allowRoutingRules: false,
          allowDelegation: false,
          allowStageRooms: false,
          allowRecording: false,
          allowGroupCalls: true,
          maxCallMinutesPerMonth: null, // unlimited
          maxCallsPerDay: null,
          maxCallDurationMinutes: null,
        }
      },
      {
        planId: 'business',
        data: {
          maxCallIds: 5,
          maxGroupParticipants: 10,
          allowCallWaiting: true,
          allowCallMerge: true,
          allowPaidCalls: true,
          allowRoutingRules: true,
          allowDelegation: true,
          allowStageRooms: false,
          allowRecording: true,
          allowGroupCalls: true,
          maxCallMinutesPerMonth: null,
          maxCallsPerDay: null,
          maxCallDurationMinutes: null,
        }
      },
      {
        planId: 'enterprise',
        data: {
          maxCallIds: 100,
          maxGroupParticipants: 100,
          allowCallWaiting: true,
          allowCallMerge: true,
          allowPaidCalls: true,
          allowRoutingRules: true,
          allowDelegation: true,
          allowStageRooms: true,
          allowRecording: true,
          allowGroupCalls: true,
          maxCallMinutesPerMonth: null,
          maxCallsPerDay: null,
          maxCallDurationMinutes: null,
        }
      }
    ];

    for (const { planId, data } of defaults) {
      const existing = await this.getPlanEntitlements(planId);
      if (!existing) {
        await db.insert(planEntitlements).values({ planId, ...data });
      }
    }
  }

  // User Entitlement Overrides (Admin)
  async getUserEntitlementOverrides(userAddress: string): Promise<UserEntitlementOverrides | undefined> {
    const [overrides] = await db.select().from(userEntitlementOverrides)
      .where(eq(userEntitlementOverrides.userAddress, userAddress));
    
    // Check if overrides have expired
    if (overrides && overrides.expiresAt && new Date(overrides.expiresAt) < new Date()) {
      // Expired, delete and return undefined
      await db.delete(userEntitlementOverrides).where(eq(userEntitlementOverrides.userAddress, userAddress));
      return undefined;
    }
    
    return overrides || undefined;
  }

  async setUserEntitlementOverrides(
    userAddress: string, 
    overrides: Record<string, any>, 
    grantedBy?: string, 
    expiresAt?: Date,
    reason?: string
  ): Promise<UserEntitlementOverrides> {
    const existing = await this.getUserEntitlementOverrides(userAddress);
    if (existing) {
      const [updated] = await db.update(userEntitlementOverrides)
        .set({ overrides, grantedBy, expiresAt, reason, updatedAt: new Date() })
        .where(eq(userEntitlementOverrides.userAddress, userAddress))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userEntitlementOverrides)
        .values({ userAddress, overrides, grantedBy, expiresAt, reason })
        .returning();
      return created;
    }
  }

  async deleteUserEntitlementOverrides(userAddress: string): Promise<boolean> {
    const result = await db.delete(userEntitlementOverrides)
      .where(eq(userEntitlementOverrides.userAddress, userAddress))
      .returning();
    return result.length > 0;
  }

  // Set a single entitlement override (merges with existing overrides)
  async setUserEntitlementOverride(
    userAddress: string, 
    featureKey: string, 
    value: any, 
    grantedBy?: string, 
    expiresAt?: Date,
    reason?: string
  ): Promise<UserEntitlementOverrides> {
    const existing = await this.getUserEntitlementOverrides(userAddress);
    const currentOverrides = (existing?.overrides as Record<string, any>) || {};
    
    // Merge new override with existing
    const newOverrides = {
      ...currentOverrides,
      [featureKey]: value,
    };
    
    return this.setUserEntitlementOverrides(userAddress, newOverrides, grantedBy, expiresAt, reason);
  }

  // Delete a single entitlement override key
  async deleteUserEntitlementOverride(userAddress: string, featureKey: string): Promise<boolean> {
    const existing = await this.getUserEntitlementOverrides(userAddress);
    if (!existing) return false;
    
    const currentOverrides = (existing.overrides as Record<string, any>) || {};
    if (!(featureKey in currentOverrides)) return false;
    
    // Remove the key
    delete currentOverrides[featureKey];
    
    // If no more overrides, delete the whole record
    if (Object.keys(currentOverrides).length === 0) {
      return this.deleteUserEntitlementOverrides(userAddress);
    }
    
    // Otherwise update with remaining overrides
    await this.setUserEntitlementOverrides(userAddress, currentOverrides, existing.grantedBy ?? undefined, existing.expiresAt ?? undefined, existing.reason ?? undefined);
    return true;
  }

  async getAllUserOverrides(): Promise<UserEntitlementOverrides[]> {
    return db.select().from(userEntitlementOverrides).orderBy(desc(userEntitlementOverrides.updatedAt));
  }
  
  // Platform pricing implementation
  async getPlatformPricing(): Promise<PlatformPricing[]> {
    return db.select().from(platformPricing).where(eq(platformPricing.isActive, true)).orderBy(asc(platformPricing.displayOrder));
  }
  
  async getPlatformPricingByPlan(planId: string): Promise<PlatformPricing | undefined> {
    const [result] = await db.select().from(platformPricing).where(eq(platformPricing.planId, planId));
    return result || undefined;
  }
  
  async upsertPlatformPricing(pricing: InsertPlatformPricing): Promise<PlatformPricing> {
    const existing = await this.getPlatformPricingByPlan(pricing.planId);
    if (existing) {
      const [updated] = await db.update(platformPricing)
        .set({ ...pricing, updatedAt: new Date() })
        .where(eq(platformPricing.planId, pricing.planId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(platformPricing).values(pricing).returning();
    return created;
  }
  
  // Subscription purchases implementation
  async createSubscriptionPurchase(purchase: InsertSubscriptionPurchase): Promise<SubscriptionPurchase> {
    const [created] = await db.insert(subscriptionPurchases).values(purchase).returning();
    return created;
  }
  
  async getSubscriptionPurchaseByUser(userAddress: string): Promise<SubscriptionPurchase | undefined> {
    const [result] = await db.select().from(subscriptionPurchases)
      .where(and(
        eq(subscriptionPurchases.userAddress, userAddress),
        eq(subscriptionPurchases.status, 'active')
      ))
      .orderBy(desc(subscriptionPurchases.purchasedAt));
    return result || undefined;
  }
  
  async getSubscriptionPurchaseByTransaction(provider: string, transactionId: string): Promise<SubscriptionPurchase | undefined> {
    const [result] = await db.select().from(subscriptionPurchases)
      .where(and(
        eq(subscriptionPurchases.provider, provider),
        eq(subscriptionPurchases.providerTransactionId, transactionId)
      ));
    return result || undefined;
  }
  
  async updateSubscriptionPurchase(id: string, updates: Partial<SubscriptionPurchase>): Promise<SubscriptionPurchase | undefined> {
    const [updated] = await db.update(subscriptionPurchases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptionPurchases.id, id))
      .returning();
    return updated || undefined;
  }

  // ========== SCHEDULED CALLS ==========
  async createScheduledCall(data: InsertScheduledCall): Promise<ScheduledCall> {
    const [created] = await db.insert(scheduledCalls).values(data).returning();
    return created;
  }

  async getScheduledCall(id: string): Promise<ScheduledCall | undefined> {
    const [result] = await db.select().from(scheduledCalls).where(eq(scheduledCalls.id, id));
    return result || undefined;
  }

  async getScheduledCallsForCreator(creatorAddress: string, options?: { 
    status?: string; 
    fromDate?: Date; 
    toDate?: Date;
    limit?: number;
  }): Promise<ScheduledCall[]> {
    let query = db.select().from(scheduledCalls)
      .where(eq(scheduledCalls.creatorAddress, creatorAddress))
      .orderBy(asc(scheduledCalls.scheduledAt));
    
    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    return query;
  }

  async getScheduledCallsForCaller(callerAddress: string): Promise<ScheduledCall[]> {
    return db.select().from(scheduledCalls)
      .where(eq(scheduledCalls.callerAddress, callerAddress))
      .orderBy(asc(scheduledCalls.scheduledAt));
  }

  async getUpcomingScheduledCalls(creatorAddress: string, limit = 10): Promise<ScheduledCall[]> {
    return db.select().from(scheduledCalls)
      .where(and(
        eq(scheduledCalls.creatorAddress, creatorAddress),
        eq(scheduledCalls.status, 'confirmed'),
        gte(scheduledCalls.scheduledAt, new Date())
      ))
      .orderBy(asc(scheduledCalls.scheduledAt))
      .limit(limit);
  }

  async updateScheduledCall(id: string, updates: Partial<ScheduledCall>): Promise<ScheduledCall | undefined> {
    const [updated] = await db.update(scheduledCalls)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scheduledCalls.id, id))
      .returning();
    return updated || undefined;
  }

  async cancelScheduledCall(id: string, cancelledBy: string, reason?: string): Promise<ScheduledCall | undefined> {
    const [updated] = await db.update(scheduledCalls)
      .set({ 
        status: 'cancelled', 
        cancelledAt: new Date(), 
        cancelledBy, 
        cancelReason: reason,
        updatedAt: new Date() 
      })
      .where(eq(scheduledCalls.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteScheduledCall(id: string): Promise<boolean> {
    const result = await db.delete(scheduledCalls).where(eq(scheduledCalls.id, id)).returning();
    return result.length > 0;
  }

  // ========== TEAMS ==========
  async createTeam(data: InsertTeam): Promise<Team> {
    const [created] = await db.insert(teams).values(data).returning();
    return created;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.id, id));
    return result || undefined;
  }

  async getTeamsForOwner(ownerAddress: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.ownerAddress, ownerAddress));
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | undefined> {
    const [updated] = await db.update(teams)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTeam(id: string): Promise<boolean> {
    // Delete team members first
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    const result = await db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
  }

  // ========== TEAM MEMBERS ==========
  async addTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(data).returning();
    return created;
  }

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }

  async getTeamMember(teamId: string, memberAddress: string): Promise<TeamMember | undefined> {
    const [result] = await db.select().from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.memberAddress, memberAddress)
      ));
    return result || undefined;
  }

  async getTeamsForMember(memberAddress: string): Promise<{ team: Team; membership: TeamMember }[]> {
    const memberships = await db.select().from(teamMembers)
      .where(eq(teamMembers.memberAddress, memberAddress));
    
    const results: { team: Team; membership: TeamMember }[] = [];
    for (const membership of memberships) {
      const team = await this.getTeam(membership.teamId);
      if (team) {
        results.push({ team, membership });
      }
    }
    return results;
  }

  async updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember | undefined> {
    const [updated] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    return updated || undefined;
  }

  async removeTeamMember(teamId: string, memberAddress: string): Promise<boolean> {
    const result = await db.delete(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.memberAddress, memberAddress)
      ))
      .returning();
    return result.length > 0;
  }

  // ========== CALL PRIORITY ==========
  async updateUserCallPriority(address: string, priority: number): Promise<void> {
    await this.updateIdentity(address, { callPriority: priority } as any);
  }

  async setUserPrioritySupport(address: string, enabled: boolean): Promise<void> {
    await this.updateIdentity(address, { prioritySupport: enabled } as any);
  }
}

export const storage = new DatabaseStorage();
export { db };
