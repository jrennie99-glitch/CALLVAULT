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
  
  // Audit logs
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAuditLogs(options?: { actorAddress?: string; targetAddress?: string; limit?: number }): Promise<AdminAuditLog[]>;
  
  // Trial nonces (replay protection)
  isTrialNonceUsed(address: string, nonce: string): Promise<boolean>;
  markTrialNonceUsed(address: string, nonce: string): Promise<boolean>;
  cleanupOldTrialNonces(): Promise<void>;
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
}

export const storage = new DatabaseStorage();
