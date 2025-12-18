export interface Contact {
  id: string;
  name: string;
  address: string;
  avatar?: string;
  addedAt: number;
}

export interface CallRecord {
  id: string;
  contactId?: string;
  contactName?: string;
  address: string;
  type: 'incoming' | 'outgoing' | 'missed';
  mediaType: 'audio' | 'video';
  timestamp: number;
  duration?: number;
}

export interface UserProfile {
  displayName: string;
  avatar?: string;
}

export interface AppSettings {
  biometricLockEnabled: boolean;
  biometricCredentialId?: string;
  hideAdvancedByDefault: boolean;
  turnUrl?: string;
  turnUser?: string;
  turnPass?: string;
}

const CONTACTS_KEY = 'crypto_call_contacts';
const CALL_HISTORY_KEY = 'crypto_call_history';
const PROFILE_KEY = 'crypto_call_profile';
const SETTINGS_KEY = 'crypto_call_settings';
const BIOMETRIC_KEY = 'crypto_call_biometric';

export function getContacts(): Contact[] {
  const stored = localStorage.getItem(CONTACTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function addContact(contact: Omit<Contact, 'id' | 'addedAt'>): Contact {
  const contacts = getContacts();
  const newContact: Contact = {
    ...contact,
    id: crypto.randomUUID(),
    addedAt: Date.now()
  };
  contacts.push(newContact);
  saveContacts(contacts);
  return newContact;
}

export function updateContact(id: string, updates: Partial<Contact>): void {
  const contacts = getContacts();
  const index = contacts.findIndex(c => c.id === id);
  if (index !== -1) {
    contacts[index] = { ...contacts[index], ...updates };
    saveContacts(contacts);
  }
}

export function deleteContact(id: string): void {
  const contacts = getContacts().filter(c => c.id !== id);
  saveContacts(contacts);
}

export function getContactByAddress(address: string): Contact | undefined {
  return getContacts().find(c => c.address === address);
}

export function getCallHistory(): CallRecord[] {
  const stored = localStorage.getItem(CALL_HISTORY_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveCallHistory(history: CallRecord[]): void {
  localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(history));
}

export function addCallRecord(record: Omit<CallRecord, 'id'>): CallRecord {
  const history = getCallHistory();
  const newRecord: CallRecord = {
    ...record,
    id: crypto.randomUUID()
  };
  history.unshift(newRecord);
  if (history.length > 100) history.pop();
  saveCallHistory(history);
  return newRecord;
}

export function getUserProfile(): UserProfile {
  const stored = localStorage.getItem(PROFILE_KEY);
  return stored ? JSON.parse(stored) : { displayName: 'Anonymous' };
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getAppSettings(): AppSettings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? JSON.parse(stored) : {
    biometricLockEnabled: false,
    hideAdvancedByDefault: true
  };
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getBiometricCredential(): string | null {
  return localStorage.getItem(BIOMETRIC_KEY);
}

export function saveBiometricCredential(credentialId: string): void {
  localStorage.setItem(BIOMETRIC_KEY, credentialId);
}

export function clearBiometricCredential(): void {
  localStorage.removeItem(BIOMETRIC_KEY);
}
