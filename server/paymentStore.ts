import type { CreatorProfile, BusinessHours, CallPricing, PaidCallToken, QueueEntry, BusinessHoursSlot } from '@shared/types';

const creatorProfiles = new Map<string, CreatorProfile>();
const businessHours = new Map<string, BusinessHours>();
const callPricing = new Map<string, CallPricing>();
const paidTokens = new Map<string, PaidCallToken>();
const callQueues = new Map<string, QueueEntry[]>();

export function getDefaultBusinessHours(): BusinessHoursSlot[] {
  return [0, 1, 2, 3, 4, 5, 6].map(day => ({
    day: day as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    enabled: day >= 1 && day <= 5,
    start: '09:00',
    end: '17:00'
  }));
}

export function getDefaultCallPricing(ownerAddress: string): CallPricing {
  return {
    owner_address: ownerAddress,
    enabled: false,
    mode: 'per_session',
    session_price_cents: 2500,
    session_duration_minutes: 15,
    per_minute_price_cents: 200,
    minimum_minutes: 5,
    currency: 'usd',
    free_first_call: false,
    friends_family_addresses: [],
    updated_at: Date.now()
  };
}

export const paymentStore = {
  getCreatorProfile(address: string): CreatorProfile | null {
    return creatorProfiles.get(address) || null;
  },

  setCreatorProfile(profile: CreatorProfile): void {
    creatorProfiles.set(profile.address, profile);
  },

  getBusinessHours(address: string): BusinessHours | null {
    return businessHours.get(address) || null;
  },

  setBusinessHours(hours: BusinessHours): void {
    businessHours.set(hours.owner_address, hours);
  },

  getCallPricing(address: string): CallPricing | null {
    return callPricing.get(address) || null;
  },

  setCallPricing(pricing: CallPricing): void {
    callPricing.set(pricing.owner_address, pricing);
  },

  getPaidToken(tokenId: string): PaidCallToken | null {
    return paidTokens.get(tokenId) || null;
  },

  setPaidToken(token: PaidCallToken): void {
    paidTokens.set(token.id, token);
  },

  burnToken(tokenId: string): boolean {
    const token = paidTokens.get(tokenId);
    if (!token || token.burned) return false;
    token.burned = true;
    paidTokens.set(tokenId, token);
    return true;
  },

  getQueue(recipientAddress: string): QueueEntry[] {
    return callQueues.get(recipientAddress) || [];
  },

  addToQueue(entry: QueueEntry): number {
    const queue = callQueues.get(entry.recipient_address) || [];
    entry.position = queue.length + 1;
    queue.push(entry);
    callQueues.set(entry.recipient_address, queue);
    return entry.position;
  },

  removeFromQueue(recipientAddress: string, entryId: string): void {
    const queue = callQueues.get(recipientAddress) || [];
    const filtered = queue.filter(e => e.id !== entryId);
    filtered.forEach((e, i) => { e.position = i + 1; });
    callQueues.set(recipientAddress, filtered);
  },

  getNextInQueue(recipientAddress: string): QueueEntry | null {
    const queue = callQueues.get(recipientAddress) || [];
    return queue[0] || null;
  },

  isWithinBusinessHours(address: string): boolean {
    const hours = businessHours.get(address);
    if (!hours) return true;

    const now = new Date();
    const daySlot = hours.slots.find(s => s.day === now.getDay());
    if (!daySlot || !daySlot.enabled) return false;

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return currentTime >= daySlot.start && currentTime <= daySlot.end;
  },

  requiresPayment(callerAddress: string, recipientAddress: string): boolean {
    const pricing = callPricing.get(recipientAddress);
    if (!pricing || !pricing.enabled) return false;
    if (pricing.friends_family_addresses.includes(callerAddress)) return false;
    return true;
  }
};
