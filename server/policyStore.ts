import * as fs from 'fs';
import * as path from 'path';
import type { CallPolicy, ContactOverride, CallPass, BlockedUser, RoutingRule, WalletVerification, CallRequest } from '@shared/types';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJson<T>(filename: string, defaultValue: T): T {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

function saveJson<T>(filename: string, data: T): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let policies: Map<string, CallPolicy> = new Map(
  Object.entries(loadJson<Record<string, CallPolicy>>('policies.json', {}))
);

let overrides: Map<string, ContactOverride[]> = new Map(
  Object.entries(loadJson<Record<string, ContactOverride[]>>('overrides.json', {}))
);

let passes: Map<string, CallPass> = new Map(
  Object.entries(loadJson<Record<string, CallPass>>('passes.json', {}))
);

let blocklist: Map<string, BlockedUser[]> = new Map(
  Object.entries(loadJson<Record<string, BlockedUser[]>>('blocklist.json', {}))
);

let routingRules: Map<string, RoutingRule[]> = new Map(
  Object.entries(loadJson<Record<string, RoutingRule[]>>('routing.json', {}))
);

let walletVerifications: Map<string, WalletVerification> = new Map(
  Object.entries(loadJson<Record<string, WalletVerification>>('wallets.json', {}))
);

let callRequests: Map<string, CallRequest> = new Map();

let attemptCounters: Map<string, { count: number; lastAttempt: number; rejections: number }> = new Map();

export function getDefaultPolicy(): Omit<CallPolicy, 'owner_address' | 'updated_at'> {
  return {
    allow_calls_from: 'contacts',
    unknown_caller_behavior: 'request',
    max_rings_per_sender: 5,
    ring_window_minutes: 10,
    auto_block_after_rejections: 5
  };
}

export function getPolicy(address: string): CallPolicy | null {
  return policies.get(address) || null;
}

export function savePolicy(policy: CallPolicy): void {
  policies.set(policy.owner_address, policy);
  saveJson('policies.json', Object.fromEntries(policies));
}

export function getOverrides(ownerAddress: string): ContactOverride[] {
  return overrides.get(ownerAddress) || [];
}

export function getOverride(ownerAddress: string, contactAddress: string): ContactOverride | null {
  const list = overrides.get(ownerAddress) || [];
  return list.find(o => o.contact_address === contactAddress) || null;
}

export function saveOverride(override: ContactOverride): void {
  const list = overrides.get(override.owner_address) || [];
  const idx = list.findIndex(o => o.contact_address === override.contact_address);
  if (idx >= 0) {
    list[idx] = override;
  } else {
    list.push(override);
  }
  overrides.set(override.owner_address, list);
  saveJson('overrides.json', Object.fromEntries(overrides));
}

export function createPass(passData: Omit<CallPass, 'id' | 'created_at' | 'burned' | 'revoked'>): CallPass {
  const pass: CallPass = {
    ...passData,
    id: `pass_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    created_at: Date.now(),
    burned: false,
    revoked: false
  };
  passes.set(pass.id, pass);
  saveJson('passes.json', Object.fromEntries(passes));
  return pass;
}

export function getPass(passId: string): CallPass | null {
  return passes.get(passId) || null;
}

export function getPassesForRecipient(recipientAddress: string): CallPass[] {
  return Array.from(passes.values()).filter(p => 
    p.recipient_address === recipientAddress && !p.revoked
  );
}

export function getPassesCreatedBy(creatorAddress: string): CallPass[] {
  return Array.from(passes.values()).filter(p => 
    p.created_by === creatorAddress && !p.revoked
  );
}

export function validatePass(passId: string): { valid: boolean; reason?: string } {
  const pass = passes.get(passId);
  if (!pass) return { valid: false, reason: 'Pass not found' };
  if (pass.revoked) return { valid: false, reason: 'Pass revoked' };
  if (pass.burned) return { valid: false, reason: 'Pass already used' };
  if (pass.expires_at && Date.now() > pass.expires_at) {
    return { valid: false, reason: 'Pass expired' };
  }
  if (pass.pass_type === 'limited' && pass.uses_remaining !== undefined && pass.uses_remaining <= 0) {
    return { valid: false, reason: 'No uses remaining' };
  }
  return { valid: true };
}

export function consumePass(passId: string): void {
  const pass = passes.get(passId);
  if (!pass) return;
  
  if (pass.pass_type === 'one_time') {
    pass.burned = true;
  } else if (pass.pass_type === 'limited' && pass.uses_remaining !== undefined) {
    pass.uses_remaining--;
    if (pass.uses_remaining <= 0) {
      pass.burned = true;
    }
  }
  passes.set(passId, pass);
  saveJson('passes.json', Object.fromEntries(passes));
}

export function revokePass(passId: string): boolean {
  const pass = passes.get(passId);
  if (!pass) return false;
  pass.revoked = true;
  passes.set(passId, pass);
  saveJson('passes.json', Object.fromEntries(passes));
  return true;
}

export function getBlocklist(ownerAddress: string): BlockedUser[] {
  return blocklist.get(ownerAddress) || [];
}

export function isBlocked(ownerAddress: string, senderAddress: string): boolean {
  const list = blocklist.get(ownerAddress) || [];
  return list.some(b => b.blocked_address === senderAddress);
}

export function addToBlocklist(blocked: BlockedUser): void {
  const list = blocklist.get(blocked.owner_address) || [];
  if (!list.some(b => b.blocked_address === blocked.blocked_address)) {
    list.push(blocked);
    blocklist.set(blocked.owner_address, list);
    saveJson('blocklist.json', Object.fromEntries(blocklist));
  }
}

export function removeFromBlocklist(ownerAddress: string, blockedAddress: string): void {
  const list = blocklist.get(ownerAddress) || [];
  const filtered = list.filter(b => b.blocked_address !== blockedAddress);
  blocklist.set(ownerAddress, filtered);
  saveJson('blocklist.json', Object.fromEntries(blocklist));
}

export function getRoutingRules(ownerAddress: string): RoutingRule[] {
  return routingRules.get(ownerAddress) || [];
}

export function saveRoutingRules(ownerAddress: string, rules: RoutingRule[]): void {
  routingRules.set(ownerAddress, rules);
  saveJson('routing.json', Object.fromEntries(routingRules));
}

export function getWalletVerification(callAddress: string): WalletVerification | null {
  return walletVerifications.get(callAddress) || null;
}

export function saveWalletVerification(verification: WalletVerification): void {
  walletVerifications.set(verification.call_address, verification);
  saveJson('wallets.json', Object.fromEntries(walletVerifications));
}

export function createCallRequest(request: CallRequest): void {
  callRequests.set(request.id, request);
}

export function getCallRequest(requestId: string): CallRequest | null {
  return callRequests.get(requestId) || null;
}

export function updateCallRequest(requestId: string, status: CallRequest['status']): void {
  const req = callRequests.get(requestId);
  if (req) {
    req.status = status;
    callRequests.set(requestId, req);
  }
}

export function recordCallAttempt(recipientAddress: string, callerAddress: string): void {
  const key = `${recipientAddress}:${callerAddress}`;
  const existing = attemptCounters.get(key) || { count: 0, lastAttempt: 0, rejections: 0 };
  existing.count++;
  existing.lastAttempt = Date.now();
  attemptCounters.set(key, existing);
}

export function recordRejection(recipientAddress: string, callerAddress: string): void {
  const key = `${recipientAddress}:${callerAddress}`;
  const existing = attemptCounters.get(key) || { count: 0, lastAttempt: 0, rejections: 0 };
  existing.rejections++;
  attemptCounters.set(key, existing);
}

export function getAttemptStats(recipientAddress: string, callerAddress: string): { count: number; rejections: number; lastAttempt: number } {
  const key = `${recipientAddress}:${callerAddress}`;
  return attemptCounters.get(key) || { count: 0, rejections: 0, lastAttempt: 0 };
}

export function shouldAutoBlock(recipientAddress: string, callerAddress: string): boolean {
  const policy = getPolicy(recipientAddress);
  if (!policy) return false;
  
  const stats = getAttemptStats(recipientAddress, callerAddress);
  return stats.rejections >= policy.auto_block_after_rejections;
}

export function isWithinRateLimit(recipientAddress: string, callerAddress: string): boolean {
  const policy = getPolicy(recipientAddress) || { ...getDefaultPolicy(), owner_address: recipientAddress, updated_at: Date.now() };
  const key = `${recipientAddress}:${callerAddress}`;
  const stats = attemptCounters.get(key);
  
  if (!stats) return true;
  
  const windowMs = policy.ring_window_minutes * 60 * 1000;
  const windowStart = Date.now() - windowMs;
  
  if (stats.lastAttempt < windowStart) {
    attemptCounters.set(key, { count: 0, lastAttempt: 0, rejections: stats.rejections });
    return true;
  }
  
  return stats.count < policy.max_rings_per_sender;
}

export type CallDecision = 
  | { action: 'ring'; is_unknown: boolean }
  | { action: 'request' }
  | { action: 'block'; reason: string }
  | { action: 'auto_reply'; message: string };

export function evaluateCallPolicy(
  recipientAddress: string, 
  callerAddress: string, 
  isContact: boolean,
  passId?: string
): CallDecision {
  if (isBlocked(recipientAddress, callerAddress)) {
    return { action: 'block', reason: 'You are blocked by this user' };
  }

  if (shouldAutoBlock(recipientAddress, callerAddress)) {
    addToBlocklist({
      owner_address: recipientAddress,
      blocked_address: callerAddress,
      reason: 'Auto-blocked due to excessive rejections',
      blocked_at: Date.now()
    });
    return { action: 'block', reason: 'Auto-blocked due to excessive attempts' };
  }

  if (!isWithinRateLimit(recipientAddress, callerAddress)) {
    return { action: 'block', reason: 'Too many call attempts. Please wait.' };
  }

  if (passId) {
    const passValidation = validatePass(passId);
    if (passValidation.valid) {
      return { action: 'ring', is_unknown: !isContact };
    }
  }

  const override = getOverride(recipientAddress, callerAddress);
  if (override) {
    switch (override.permission) {
      case 'blocked':
        return { action: 'block', reason: 'You are blocked by this user' };
      case 'always':
        return { action: 'ring', is_unknown: false };
      case 'one_time':
        if (override.one_time_used) {
          return { action: 'request' };
        }
        return { action: 'ring', is_unknown: false };
      case 'scheduled':
        if (override.scheduled_hours) {
          const now = new Date();
          const currentHour = now.getHours();
          if (currentHour >= override.scheduled_hours.start && currentHour < override.scheduled_hours.end) {
            return { action: 'ring', is_unknown: false };
          }
        }
        const rules = getRoutingRules(recipientAddress);
        const afterHoursRule = rules.find(r => r.trigger === 'after_hours' && r.enabled);
        if (afterHoursRule?.auto_message) {
          return { action: 'auto_reply', message: afterHoursRule.auto_message };
        }
        return { action: 'request' };
    }
  }

  const policy = getPolicy(recipientAddress);
  if (!policy) {
    return isContact ? { action: 'ring', is_unknown: false } : { action: 'request' };
  }

  switch (policy.allow_calls_from) {
    case 'anyone':
      return { action: 'ring', is_unknown: !isContact };
    
    case 'invite_only':
      return { action: 'block', reason: 'This user only accepts calls with invite passes' };
    
    case 'contacts':
    default:
      if (isContact) {
        return { action: 'ring', is_unknown: false };
      }
      
      switch (policy.unknown_caller_behavior) {
        case 'block':
          return { action: 'block', reason: 'This user only accepts calls from contacts' };
        case 'ring_unknown':
          return { action: 'ring', is_unknown: true };
        case 'request':
        default:
          return { action: 'request' };
      }
  }
}

export function markOneTimeOverrideUsed(ownerAddress: string, contactAddress: string): void {
  const override = getOverride(ownerAddress, contactAddress);
  if (override && override.permission === 'one_time') {
    override.one_time_used = true;
    saveOverride(override);
  }
}
