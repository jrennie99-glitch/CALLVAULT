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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, ilike, or } from "drizzle-orm";

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
  createInviteLink(link: InsertInviteLink): Promise<InviteLink>;
  updateInviteLink(id: string, updates: Partial<InviteLink>): Promise<InviteLink | undefined>;
  deleteInviteLink(id: string): Promise<boolean>;
  redeemInviteLink(code: string, redeemerAddress: string): Promise<{ success: boolean; error?: string; link?: InviteLink }>;
  getInviteRedemptions(inviteLinkId: string): Promise<InviteRedemption[]>;

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
    return db.select().from(callQueueEntries)
      .where(and(eq(callQueueEntries.creatorAddress, creatorAddress), eq(callQueueEntries.status, "waiting")))
      .orderBy(asc(callQueueEntries.position));
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
    if (!identity) return 'free';
    
    // Admin/founder = admin tier
    if (identity.role === 'admin' || identity.role === 'founder') {
      return 'admin';
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
}

export const storage = new DatabaseStorage();
