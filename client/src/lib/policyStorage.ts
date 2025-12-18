import type { CallPolicy, ContactOverride, CallPass, BlockedUser, RoutingRule, WalletVerification, AIGuardianSettings } from '@shared/types';

const POLICY_KEY = 'crypto_call_policy';
const OVERRIDES_KEY = 'crypto_call_overrides';
const BLOCKLIST_KEY = 'crypto_call_blocklist';
const ROUTING_KEY = 'crypto_call_routing';
const PASSES_KEY = 'crypto_call_passes';
const WALLET_KEY = 'crypto_call_wallet';
const AI_GUARDIAN_KEY = 'crypto_call_ai_guardian';

export function getDefaultPolicy(): Omit<CallPolicy, 'owner_address' | 'updated_at'> {
  return {
    allow_calls_from: 'contacts',
    unknown_caller_behavior: 'request',
    max_rings_per_sender: 5,
    ring_window_minutes: 10,
    auto_block_after_rejections: 5
  };
}

export function getLocalPolicy(): CallPolicy | null {
  const stored = localStorage.getItem(POLICY_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function saveLocalPolicy(policy: CallPolicy): void {
  localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
}

export function getLocalOverrides(): ContactOverride[] {
  const stored = localStorage.getItem(OVERRIDES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveLocalOverride(override: ContactOverride): void {
  const overrides = getLocalOverrides();
  const idx = overrides.findIndex(o => o.contact_address === override.contact_address);
  if (idx >= 0) {
    overrides[idx] = override;
  } else {
    overrides.push(override);
  }
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function deleteLocalOverride(contactAddress: string): void {
  const overrides = getLocalOverrides().filter(o => o.contact_address !== contactAddress);
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function getLocalBlocklist(): BlockedUser[] {
  const stored = localStorage.getItem(BLOCKLIST_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function addToLocalBlocklist(blocked: BlockedUser): void {
  const list = getLocalBlocklist();
  if (!list.some(b => b.blocked_address === blocked.blocked_address)) {
    list.push(blocked);
    localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(list));
  }
}

export function removeFromLocalBlocklist(blockedAddress: string): void {
  const list = getLocalBlocklist().filter(b => b.blocked_address !== blockedAddress);
  localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(list));
}

export function isLocallyBlocked(address: string): boolean {
  return getLocalBlocklist().some(b => b.blocked_address === address);
}

export function getLocalRoutingRules(): RoutingRule[] {
  const stored = localStorage.getItem(ROUTING_KEY);
  if (!stored) {
    return getDefaultRoutingRules();
  }
  return JSON.parse(stored);
}

export function getDefaultRoutingRules(): RoutingRule[] {
  return [
    {
      id: 'unknown_caller',
      owner_address: '',
      trigger: 'unknown_caller',
      enabled: true,
      auto_message: "Hi! I don't recognize your number. Please send me a message first."
    },
    {
      id: 'missed_call',
      owner_address: '',
      trigger: 'missed_call',
      enabled: true,
      auto_message: "Sorry I missed your call! Send me a message and I'll get back to you."
    },
    {
      id: 'after_hours',
      owner_address: '',
      trigger: 'after_hours',
      enabled: false,
      auto_message: "I'm currently unavailable. I'll get back to you during business hours.",
      business_hours: { start: 9, end: 17 }
    },
    {
      id: 'busy',
      owner_address: '',
      trigger: 'busy',
      enabled: true,
      auto_message: "I'm on another call right now. I'll call you back shortly."
    }
  ];
}

export function saveLocalRoutingRules(rules: RoutingRule[]): void {
  localStorage.setItem(ROUTING_KEY, JSON.stringify(rules));
}

export function getLocalPasses(): CallPass[] {
  const stored = localStorage.getItem(PASSES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveLocalPass(pass: CallPass): void {
  const passes = getLocalPasses();
  const idx = passes.findIndex(p => p.id === pass.id);
  if (idx >= 0) {
    passes[idx] = pass;
  } else {
    passes.push(pass);
  }
  localStorage.setItem(PASSES_KEY, JSON.stringify(passes));
}

export function removeLocalPass(passId: string): void {
  const passes = getLocalPasses().filter(p => p.id !== passId);
  localStorage.setItem(PASSES_KEY, JSON.stringify(passes));
}

export function getLocalWalletVerification(): WalletVerification | null {
  const stored = localStorage.getItem(WALLET_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function saveLocalWalletVerification(verification: WalletVerification): void {
  localStorage.setItem(WALLET_KEY, JSON.stringify(verification));
}

export function clearLocalWalletVerification(): void {
  localStorage.removeItem(WALLET_KEY);
}

export function getAIGuardianSettings(): AIGuardianSettings {
  const stored = localStorage.getItem(AI_GUARDIAN_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    enabled: false,
    transcription_enabled: false
  };
}

export function saveAIGuardianSettings(settings: AIGuardianSettings): void {
  localStorage.setItem(AI_GUARDIAN_KEY, JSON.stringify(settings));
}

export function formatPassExpiry(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function getPassShareUrl(passId: string): string {
  return `${window.location.origin}?pass=${passId}`;
}
