import { storage } from "./storage";
import type { EffectiveEntitlements, UserMode, FeatureFlags } from "@shared/types";

export const VALID_ENTITLEMENT_KEYS = new Set([
  'maxCallIds',
  'maxGroupParticipants',
  'maxCallMinutesPerMonth',
  'maxCallsPerDay',
  'maxCallDurationMinutes',
  'allowCallWaiting',
  'allowCallMerge',
  'allowPaidCalls',
  'allowRoutingRules',
  'allowDelegation',
  'allowStageRooms',
  'allowRecording',
  'allowGroupCalls',
  'allowCallScheduling',
  'allowTeamManagement',
  'allowCustomBranding',
  'allowPrioritySupport',
  'allowPriorityRouting',
  'allowAvailabilityControls',
]);

export function isValidEntitlementKey(key: string): boolean {
  return VALID_ENTITLEMENT_KEYS.has(key);
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  FEATURE_MODE_SWITCHER: true,
  FEATURE_MULTIPLE_CALL_IDS: false,
  FEATURE_GROUP_CALLS: false,
  FEATURE_CALL_WAITING: false,
  FEATURE_CALL_MERGE: false,
  FEATURE_ROUTING_RULES: false,
  FEATURE_DELEGATION: false,
  FEATURE_STAGE_ROOMS: false,
  FEATURE_PAID_CALLS: false,
  FEATURE_RECORDING: false,
  FEATURE_CALL_SCHEDULING: false,
  FEATURE_TEAM_MANAGEMENT: false,
  FEATURE_CUSTOM_BRANDING: false,
  FEATURE_PRIORITY_SUPPORT: false,
  FEATURE_PRIORITY_ROUTING: false,
  FEATURE_AVAILABILITY_CONTROLS: false,
};

const MODE_FEATURE_VISIBILITY: Record<UserMode, Partial<FeatureFlags>> = {
  personal: {
    FEATURE_PAID_CALLS: false,
    FEATURE_ROUTING_RULES: false,
    FEATURE_DELEGATION: false,
    FEATURE_STAGE_ROOMS: false,
  },
  creator: {
    FEATURE_PAID_CALLS: true,
    FEATURE_ROUTING_RULES: false,
    FEATURE_DELEGATION: false,
    FEATURE_STAGE_ROOMS: false,
  },
  business: {
    FEATURE_PAID_CALLS: true,
    FEATURE_ROUTING_RULES: true,
    FEATURE_DELEGATION: true,
    FEATURE_STAGE_ROOMS: false,
  },
  stage: {
    FEATURE_PAID_CALLS: true,
    FEATURE_ROUTING_RULES: true,
    FEATURE_DELEGATION: true,
    FEATURE_STAGE_ROOMS: true,
  },
};

export async function getEffectiveEntitlements(userAddress: string): Promise<EffectiveEntitlements> {
  const identity = await storage.getIdentity(userAddress);
  const plan = identity?.plan || 'free';
  
  const modeSettings = await storage.ensureUserModeSettings(userAddress);
  const mode = modeSettings.mode as UserMode;
  
  const planEntitlements = await storage.getPlanEntitlements(plan);
  const userOverrides = await storage.getUserEntitlementOverrides(userAddress);
  
  const isPro = plan === 'pro' || plan === 'business' || plan === 'enterprise';
  const isBusiness = plan === 'business' || plan === 'enterprise';
  
  const baseEntitlements = {
    maxCallIds: planEntitlements?.maxCallIds ?? 1,
    maxGroupParticipants: planEntitlements?.maxGroupParticipants ?? 0,
    maxCallMinutesPerMonth: planEntitlements?.maxCallMinutesPerMonth ?? 30,
    maxCallsPerDay: planEntitlements?.maxCallsPerDay ?? 2,
    maxCallDurationMinutes: planEntitlements?.maxCallDurationMinutes ?? 10,
    allowCallWaiting: planEntitlements?.allowCallWaiting ?? false,
    allowCallMerge: planEntitlements?.allowCallMerge ?? false,
    allowPaidCalls: planEntitlements?.allowPaidCalls ?? false,
    allowRoutingRules: planEntitlements?.allowRoutingRules ?? false,
    allowDelegation: planEntitlements?.allowDelegation ?? false,
    allowStageRooms: planEntitlements?.allowStageRooms ?? false,
    allowRecording: planEntitlements?.allowRecording ?? false,
    allowGroupCalls: planEntitlements?.allowGroupCalls ?? false,
    allowCallScheduling: isPro,
    allowTeamManagement: isBusiness,
    allowCustomBranding: isBusiness,
    allowPrioritySupport: isBusiness,
    allowPriorityRouting: isPro,
    allowAvailabilityControls: isPro,
  };
  
  const overrides = (userOverrides?.overrides as Record<string, any>) || {};
  const effectiveEntitlements = {
    ...baseEntitlements,
    ...overrides,
  };
  
  const modeFlags = MODE_FEATURE_VISIBILITY[mode] || {};
  const userFlags = (modeSettings.flags as Partial<FeatureFlags>) || {};
  
  const flags: FeatureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    FEATURE_GROUP_CALLS: effectiveEntitlements.allowGroupCalls,
    FEATURE_CALL_WAITING: effectiveEntitlements.allowCallWaiting,
    FEATURE_CALL_MERGE: effectiveEntitlements.allowCallMerge,
    FEATURE_PAID_CALLS: effectiveEntitlements.allowPaidCalls && (modeFlags.FEATURE_PAID_CALLS ?? false),
    FEATURE_ROUTING_RULES: effectiveEntitlements.allowRoutingRules && (modeFlags.FEATURE_ROUTING_RULES ?? false),
    FEATURE_DELEGATION: effectiveEntitlements.allowDelegation && (modeFlags.FEATURE_DELEGATION ?? false),
    FEATURE_STAGE_ROOMS: effectiveEntitlements.allowStageRooms && (modeFlags.FEATURE_STAGE_ROOMS ?? false),
    FEATURE_RECORDING: effectiveEntitlements.allowRecording,
    FEATURE_MULTIPLE_CALL_IDS: effectiveEntitlements.maxCallIds > 1,
    FEATURE_CALL_SCHEDULING: effectiveEntitlements.allowCallScheduling,
    FEATURE_TEAM_MANAGEMENT: effectiveEntitlements.allowTeamManagement,
    FEATURE_CUSTOM_BRANDING: effectiveEntitlements.allowCustomBranding,
    FEATURE_PRIORITY_SUPPORT: effectiveEntitlements.allowPrioritySupport,
    FEATURE_PRIORITY_ROUTING: effectiveEntitlements.allowPriorityRouting,
    FEATURE_AVAILABILITY_CONTROLS: effectiveEntitlements.allowAvailabilityControls,
    ...userFlags,
  };
  
  return {
    userAddress,
    plan,
    mode,
    maxCallIds: effectiveEntitlements.maxCallIds,
    maxGroupParticipants: effectiveEntitlements.maxGroupParticipants,
    maxCallMinutesPerMonth: effectiveEntitlements.maxCallMinutesPerMonth,
    maxCallsPerDay: effectiveEntitlements.maxCallsPerDay,
    maxCallDurationMinutes: effectiveEntitlements.maxCallDurationMinutes,
    allowCallWaiting: effectiveEntitlements.allowCallWaiting,
    allowCallMerge: effectiveEntitlements.allowCallMerge,
    allowPaidCalls: effectiveEntitlements.allowPaidCalls,
    allowRoutingRules: effectiveEntitlements.allowRoutingRules,
    allowDelegation: effectiveEntitlements.allowDelegation,
    allowStageRooms: effectiveEntitlements.allowStageRooms,
    allowRecording: effectiveEntitlements.allowRecording,
    allowGroupCalls: effectiveEntitlements.allowGroupCalls,
    allowCallScheduling: effectiveEntitlements.allowCallScheduling,
    allowTeamManagement: effectiveEntitlements.allowTeamManagement,
    allowCustomBranding: effectiveEntitlements.allowCustomBranding,
    allowPrioritySupport: effectiveEntitlements.allowPrioritySupport,
    allowPriorityRouting: effectiveEntitlements.allowPriorityRouting,
    allowAvailabilityControls: effectiveEntitlements.allowAvailabilityControls,
    flags,
    hasOverrides: !!userOverrides,
    overrideExpiresAt: userOverrides?.expiresAt ? new Date(userOverrides.expiresAt).getTime() : undefined,
  };
}

export function getAvailableModesForPlan(plan: string): UserMode[] {
  switch (plan) {
    case 'free':
      return ['personal'];
    case 'pro':
      return ['personal', 'creator'];
    case 'business':
      return ['personal', 'creator', 'business'];
    case 'enterprise':
      return ['personal', 'creator', 'business', 'stage'];
    default:
      return ['personal'];
  }
}

export async function canAccessFeature(userAddress: string, feature: keyof FeatureFlags): Promise<boolean> {
  const entitlements = await getEffectiveEntitlements(userAddress);
  return entitlements.flags[feature] ?? false;
}

export async function checkEntitlementLimit(
  userAddress: string,
  limit: 'maxCallIds' | 'maxGroupParticipants' | 'maxCallMinutesPerMonth' | 'maxCallsPerDay' | 'maxCallDurationMinutes',
  currentValue: number
): Promise<{ allowed: boolean; limit: number | null; reason?: string }> {
  const entitlements = await getEffectiveEntitlements(userAddress);
  const limitValue = entitlements[limit];
  
  if (limitValue === null) {
    return { allowed: true, limit: null };
  }
  
  if (currentValue >= limitValue) {
    return {
      allowed: false,
      limit: limitValue,
      reason: `You've reached your ${limit} limit of ${limitValue}. Upgrade your plan for more.`,
    };
  }
  
  return { allowed: true, limit: limitValue };
}

export async function initializeEntitlements(): Promise<void> {
  await storage.initDefaultPlanEntitlements();
  console.log('Plan entitlements initialized');
}
