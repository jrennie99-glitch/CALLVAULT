import { storage } from './storage';
import type { UsageCounter, ActiveCall } from '@shared/schema';

// Free tier limits
export const FREE_TIER_LIMITS = {
  MAX_CALL_DURATION_SECONDS: 900, // 15 minutes
  MAX_OUTBOUND_CALLS_PER_DAY: 5, // Outbound only - incoming unlimited
  MAX_CALLS_PER_DAY: 5, // Kept for backward compatibility
  MAX_SECONDS_PER_MONTH: 3600, // 60 minutes (generous for privacy use case)
  MAX_CALL_ATTEMPTS_PER_HOUR: 10,
  MAX_FAILED_STARTS_PER_DAY: 15,
  MAX_CONCURRENT_CALLS: 1, // Only 1 call at a time
  HEARTBEAT_INTERVAL_SECONDS: 15,
  HEARTBEAT_TIMEOUT_SECONDS: 45,
  IDLE_BACKGROUND_TIMEOUT_SECONDS: 60,
  IDLE_NO_MEDIA_TIMEOUT_SECONDS: 90,
  IDLE_MIC_MUTED_TIMEOUT_SECONDS: 120,
  RELAY_PENALTY_DURATION_DAYS: 7,
  RELAY_PENALTY_MAX_DURATION_SECONDS: 300, // 5 minutes during penalty
  RELAY_CALLS_THRESHOLD_24H: 2,
};

export type ShieldErrorCode = 
  | 'LIMIT_DAILY_CALLS'
  | 'LIMIT_MONTHLY_MINUTES'
  | 'LIMIT_CALL_DURATION'
  | 'LIMIT_HOURLY_ATTEMPTS'
  | 'LIMIT_FAILED_STARTS'
  | 'NOT_APPROVED_CONTACT'
  | 'GROUP_CALLS_NOT_ALLOWED'
  | 'EXTERNAL_LINKS_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'HEARTBEAT_TIMEOUT'
  | 'INBOUND_NOT_ALLOWED';

export interface ShieldCheckResult {
  allowed: boolean;
  errorCode?: ShieldErrorCode;
  message?: string;
  maxDurationSeconds?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// In-memory rate limiting (for endpoints)
const rateLimiters: Map<string, { count: number; resetAt: number }> = new Map();

export class FreeTierShield {
  // Check if user can initiate a call (BEFORE call start)
  static async canStartCall(
    callerAddress: string,
    calleeAddress: string,
    options?: {
      isContact?: boolean;
      isMutualContact?: boolean;
      isEitherContact?: boolean; // True if EITHER party has added the other
      isGroupCall?: boolean;
      isExternalLink?: boolean;
      isPaidCall?: boolean;
    }
  ): Promise<ShieldCheckResult> {
    // Check if database is available - if not, allow all calls (demo mode)
    const { isDatabaseAvailable } = await import('./db');
    if (!isDatabaseAvailable()) {
      console.log('[FreeTierShield] No database - allowing call in demo mode');
      return { allowed: true, maxDurationSeconds: FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS };
    }
    
    const tier = await storage.getUserTier(callerAddress);
    
    // Admin and paid users bypass all limits
    if (tier === 'admin' || tier === 'paid') {
      return { allowed: true, maxDurationSeconds: undefined };
    }

    // Free tier checks
    const counter = await storage.getOrCreateUsageCounter(callerAddress);

    // B.3) Free users cannot join group calls
    if (options?.isGroupCall) {
      return {
        allowed: false,
        errorCode: 'GROUP_CALLS_NOT_ALLOWED',
        message: 'Group calls require a paid plan. Upgrade to unlock group calling.'
      };
    }

    // B.4) Free users cannot use external call links
    if (options?.isExternalLink && !options?.isPaidCall) {
      return {
        allowed: false,
        errorCode: 'EXTERNAL_LINKS_NOT_ALLOWED',
        message: 'External call links require a paid plan. Upgrade to unlock this feature.'
      };
    }

    // B.1 & B.2) Free users may ONLY call when EITHER party has added the other as a contact
    // This allows calls when: caller added callee, OR callee added caller, OR both (mutual)
    const hasContactRelationship = options?.isEitherContact || options?.isMutualContact;
    if (!hasContactRelationship && !options?.isPaidCall) {
      return {
        allowed: false,
        errorCode: 'NOT_APPROVED_CONTACT',
        message: 'Free accounts can only call contacts. Add them as a contact first, or upgrade to call anyone.'
      };
    }

    // A.4) Max call attempts per hour: 5
    if ((counter.callAttemptsHour || 0) >= FREE_TIER_LIMITS.MAX_CALL_ATTEMPTS_PER_HOUR) {
      return {
        allowed: false,
        errorCode: 'LIMIT_HOURLY_ATTEMPTS',
        message: 'You\'ve reached the maximum call attempts for this hour. Please wait or upgrade for unlimited calls.'
      };
    }

    // A.5) Max failed call starts per day: 10
    if ((counter.failedStartsToday || 0) >= FREE_TIER_LIMITS.MAX_FAILED_STARTS_PER_DAY) {
      return {
        allowed: false,
        errorCode: 'LIMIT_FAILED_STARTS',
        message: 'Too many failed call attempts today. Please try again tomorrow or upgrade.'
      };
    }

    // A.2) Max outbound calls per day: 5 successful call starts
    if ((counter.callsStartedToday || 0) >= FREE_TIER_LIMITS.MAX_OUTBOUND_CALLS_PER_DAY) {
      return {
        allowed: false,
        errorCode: 'LIMIT_DAILY_CALLS',
        message: 'You\'ve used your 5 free outbound calls for today. Upgrade for unlimited calls.'
      };
    }

    // A.3) Max total call seconds per month
    if ((counter.secondsUsedMonth || 0) >= FREE_TIER_LIMITS.MAX_SECONDS_PER_MONTH) {
      return {
        allowed: false,
        errorCode: 'LIMIT_MONTHLY_MINUTES',
        message: 'You\'ve used your monthly call minutes. Upgrade for unlimited calling.'
      };
    }

    // Concurrent call check: only 1 call at a time for free users
    const activeCalls = await storage.getActiveCallsForUser(callerAddress);
    if (activeCalls.length >= FREE_TIER_LIMITS.MAX_CONCURRENT_CALLS) {
      return {
        allowed: false,
        errorCode: 'LIMIT_DAILY_CALLS',
        message: 'Free accounts can only have one call at a time. End your current call or upgrade.'
      };
    }

    // Calculate max duration for this call
    let maxDuration = FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS;
    
    // E) Relay penalty - reduce max duration
    if (counter.relayPenaltyUntil && new Date(counter.relayPenaltyUntil) > new Date()) {
      maxDuration = FREE_TIER_LIMITS.RELAY_PENALTY_MAX_DURATION_SECONDS;
    }

    // Ensure we don't exceed monthly limit
    const remainingSeconds = FREE_TIER_LIMITS.MAX_SECONDS_PER_MONTH - (counter.secondsUsedMonth || 0);
    maxDuration = Math.min(maxDuration, remainingSeconds);

    return { allowed: true, maxDurationSeconds: maxDuration };
  }

  // Check if callee can receive the inbound call (B.5)
  static async canReceiveCall(
    calleeAddress: string,
    callerAddress: string,
    options?: {
      isMutualContact?: boolean;
      isEitherContact?: boolean; // True if EITHER party has added the other
    }
  ): Promise<ShieldCheckResult> {
    const tier = await storage.getUserTier(calleeAddress);
    
    // Admin and paid users can receive any call
    if (tier === 'admin' || tier === 'paid') {
      return { allowed: true };
    }

    // B.5) Free users can receive calls when EITHER party has added the other as a contact
    const hasContactRelationship = options?.isEitherContact || options?.isMutualContact;
    if (!hasContactRelationship) {
      return {
        allowed: false,
        errorCode: 'INBOUND_NOT_ALLOWED',
        message: 'This user can only receive calls from contacts.'
      };
    }

    return { allowed: true };
  }

  // Record call attempt (always call this before starting)
  static async recordCallAttempt(callerAddress: string): Promise<void> {
    const tier = await storage.getUserTier(callerAddress);
    if (tier === 'free') {
      await storage.incrementCallAttempts(callerAddress);
    }
  }

  // Record successful call start (ON call connect)
  static async recordCallStart(
    callerAddress: string,
    calleeAddress: string,
    callSessionId: string
  ): Promise<ActiveCall> {
    const callerTier = await storage.getUserTier(callerAddress);
    const calleeTier = await storage.getUserTier(calleeAddress);

    // Increment daily counter for free users
    if (callerTier === 'free') {
      await storage.incrementCallsStarted(callerAddress);
    }

    // Calculate max duration
    let maxDuration = 0; // 0 = unlimited
    if (callerTier === 'free' || calleeTier === 'free') {
      const callerCounter = await storage.getOrCreateUsageCounter(callerAddress);
      const calleeCounter = await storage.getOrCreateUsageCounter(calleeAddress);
      
      // Use the more restrictive limit
      let callerMax = callerTier === 'free' ? FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS : Infinity;
      let calleeMax = calleeTier === 'free' ? FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS : Infinity;
      
      // Apply relay penalty if applicable
      if (callerCounter.relayPenaltyUntil && new Date(callerCounter.relayPenaltyUntil) > new Date()) {
        callerMax = Math.min(callerMax, FREE_TIER_LIMITS.RELAY_PENALTY_MAX_DURATION_SECONDS);
      }
      if (calleeCounter.relayPenaltyUntil && new Date(calleeCounter.relayPenaltyUntil) > new Date()) {
        calleeMax = Math.min(calleeMax, FREE_TIER_LIMITS.RELAY_PENALTY_MAX_DURATION_SECONDS);
      }
      
      maxDuration = Math.min(callerMax, calleeMax);
      if (maxDuration === Infinity) maxDuration = 0;
    }

    // Create active call record
    const now = new Date();
    return storage.createActiveCall({
      callSessionId,
      callerAddress,
      calleeAddress,
      callerTier,
      calleeTier,
      startedAt: now,
      lastHeartbeatCaller: now,
      lastHeartbeatCallee: now,
      relayUsed: false,
      maxDurationSeconds: maxDuration || null,
    });
  }

  // Record failed call start
  static async recordFailedStart(callerAddress: string): Promise<void> {
    const tier = await storage.getUserTier(callerAddress);
    if (tier === 'free') {
      await storage.incrementFailedStarts(callerAddress);
    }
  }

  // Update heartbeat (DURING call)
  static async updateHeartbeat(
    callSessionId: string,
    userAddress: string,
    isRelay?: boolean
  ): Promise<{ shouldTerminate: boolean; reason?: string; remainingSeconds?: number }> {
    const activeCall = await storage.getActiveCall(callSessionId);
    if (!activeCall) {
      return { shouldTerminate: true, reason: 'Call not found' };
    }

    const now = new Date();
    const isCaller = activeCall.callerAddress === userAddress;
    
    // Update heartbeat
    const updates: Partial<ActiveCall> = isCaller
      ? { lastHeartbeatCaller: now }
      : { lastHeartbeatCallee: now };

    // Track relay usage
    if (isRelay && !activeCall.relayUsed) {
      updates.relayUsed = true;
    }

    await storage.updateActiveCall(callSessionId, updates);

    // Check if call should be terminated due to duration limit
    if (activeCall.maxDurationSeconds && activeCall.maxDurationSeconds > 0) {
      const elapsedSeconds = Math.floor((now.getTime() - new Date(activeCall.startedAt).getTime()) / 1000);
      const remainingSeconds = activeCall.maxDurationSeconds - elapsedSeconds;
      
      if (remainingSeconds <= 0) {
        return { 
          shouldTerminate: true, 
          reason: 'LIMIT_CALL_DURATION',
          remainingSeconds: 0
        };
      }
      
      return { shouldTerminate: false, remainingSeconds };
    }

    return { shouldTerminate: false };
  }

  // End call and update counters (ON call end)
  static async recordCallEnd(
    callSessionId: string,
    durationSeconds: number
  ): Promise<void> {
    const activeCall = await storage.getActiveCall(callSessionId);
    if (!activeCall) return;

    // Update monthly seconds for free users
    if (activeCall.callerTier === 'free') {
      await storage.addSecondsUsed(activeCall.callerAddress, durationSeconds);
    }
    if (activeCall.calleeTier === 'free' && activeCall.calleeAddress !== activeCall.callerAddress) {
      await storage.addSecondsUsed(activeCall.calleeAddress, durationSeconds);
    }

    // Handle relay penalty (E)
    if (activeCall.relayUsed) {
      if (activeCall.callerTier === 'free') {
        const counter = await storage.incrementRelayCalls(activeCall.callerAddress);
        if ((counter.relayCalls24h || 0) >= FREE_TIER_LIMITS.RELAY_CALLS_THRESHOLD_24H) {
          const penaltyEnd = new Date();
          penaltyEnd.setDate(penaltyEnd.getDate() + FREE_TIER_LIMITS.RELAY_PENALTY_DURATION_DAYS);
          await storage.updateUsageCounter(activeCall.callerAddress, { relayPenaltyUntil: penaltyEnd });
        }
      }
      if (activeCall.calleeTier === 'free') {
        const counter = await storage.incrementRelayCalls(activeCall.calleeAddress);
        if ((counter.relayCalls24h || 0) >= FREE_TIER_LIMITS.RELAY_CALLS_THRESHOLD_24H) {
          const penaltyEnd = new Date();
          penaltyEnd.setDate(penaltyEnd.getDate() + FREE_TIER_LIMITS.RELAY_PENALTY_DURATION_DAYS);
          await storage.updateUsageCounter(activeCall.calleeAddress, { relayPenaltyUntil: penaltyEnd });
        }
      }
    }

    // Delete active call record
    await storage.deleteActiveCall(callSessionId);
  }

  // Check stale calls and terminate them (server-side monitoring)
  static async terminateStaleCalls(): Promise<string[]> {
    const staleCalls = await storage.getStaleActiveCalls(FREE_TIER_LIMITS.HEARTBEAT_TIMEOUT_SECONDS);
    const terminatedIds: string[] = [];

    for (const call of staleCalls) {
      const now = new Date();
      const durationSeconds = Math.floor((now.getTime() - new Date(call.startedAt).getTime()) / 1000);
      await this.recordCallEnd(call.callSessionId, durationSeconds);
      terminatedIds.push(call.callSessionId);
    }

    return terminatedIds;
  }

  // Check if call should be terminated due to duration limit
  static async checkCallDuration(callSessionId: string): Promise<{ shouldTerminate: boolean; reason?: string }> {
    const activeCall = await storage.getActiveCall(callSessionId);
    if (!activeCall) {
      return { shouldTerminate: true, reason: 'Call not found' };
    }

    if (activeCall.maxDurationSeconds && activeCall.maxDurationSeconds > 0) {
      const now = new Date();
      const elapsedSeconds = Math.floor((now.getTime() - new Date(activeCall.startedAt).getTime()) / 1000);
      
      if (elapsedSeconds >= activeCall.maxDurationSeconds) {
        return { shouldTerminate: true, reason: 'LIMIT_CALL_DURATION' };
      }
    }

    return { shouldTerminate: false };
  }

  // Rate limiting for endpoints (F)
  static checkRateLimit(
    key: string, // e.g., "call_start:userAddress" or "heartbeat:ip"
    config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
  ): boolean {
    const now = Date.now();
    const limiter = rateLimiters.get(key);

    if (!limiter || now >= limiter.resetAt) {
      rateLimiters.set(key, { count: 1, resetAt: now + config.windowMs });
      return true;
    }

    if (limiter.count >= config.maxRequests) {
      return false;
    }

    limiter.count++;
    return true;
  }

  // Rate limit configs for different endpoints
  static readonly RATE_LIMITS = {
    CALL_START: { windowMs: 60000, maxRequests: 10 },
    CALL_ACCEPT: { windowMs: 60000, maxRequests: 20 },
    HEARTBEAT: { windowMs: 60000, maxRequests: 60 },
    PAYMENT: { windowMs: 60000, maxRequests: 5 },
    CALL_LINK_OPEN: { windowMs: 60000, maxRequests: 20 },
  };

  // Check if a feature is disabled for free users (C)
  static async isFeatureDisabled(
    userAddress: string,
    feature: 'recording' | 'transcription' | 'media_upload' | 'analytics_export' | 'background_persistence'
  ): Promise<boolean> {
    const tier = await storage.getUserTier(userAddress);
    return tier === 'free';
  }

  // Get remaining limits for a user (for UI display)
  static async getRemainingLimits(userAddress: string): Promise<{
    tier: 'free' | 'paid' | 'admin';
    callsRemainingToday: number;
    minutesRemainingMonth: number;
    attemptsRemainingHour: number;
    hasRelayPenalty: boolean;
    maxCallDurationSeconds: number;
  }> {
    const tier = await storage.getUserTier(userAddress);
    
    if (tier !== 'free') {
      return {
        tier,
        callsRemainingToday: Infinity,
        minutesRemainingMonth: Infinity,
        attemptsRemainingHour: Infinity,
        hasRelayPenalty: false,
        maxCallDurationSeconds: 0, // unlimited
      };
    }

    const counter = await storage.getOrCreateUsageCounter(userAddress);
    const hasRelayPenalty = counter.relayPenaltyUntil ? new Date(counter.relayPenaltyUntil) > new Date() : false;

    return {
      tier,
      callsRemainingToday: Math.max(0, FREE_TIER_LIMITS.MAX_OUTBOUND_CALLS_PER_DAY - (counter.callsStartedToday || 0)),
      minutesRemainingMonth: Math.max(0, Math.floor((FREE_TIER_LIMITS.MAX_SECONDS_PER_MONTH - (counter.secondsUsedMonth || 0)) / 60)),
      attemptsRemainingHour: Math.max(0, FREE_TIER_LIMITS.MAX_CALL_ATTEMPTS_PER_HOUR - (counter.callAttemptsHour || 0)),
      hasRelayPenalty,
      maxCallDurationSeconds: hasRelayPenalty 
        ? FREE_TIER_LIMITS.RELAY_PENALTY_MAX_DURATION_SECONDS 
        : FREE_TIER_LIMITS.MAX_CALL_DURATION_SECONDS,
    };
  }
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimiters.entries());
  for (const [key, limiter] of entries) {
    if (now >= limiter.resetAt) {
      rateLimiters.delete(key);
    }
  }
}, 60000); // Clean up every minute
