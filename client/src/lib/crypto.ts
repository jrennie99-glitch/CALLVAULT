import nacl from "tweetnacl";
import bs58 from "bs58";
import type { CryptoIdentity, CallIntent, SignedCallIntent, Message, SignedMessage } from "@shared/types";

const STORAGE_KEY = "crypto_identity";

export function generateIdentity(): CryptoIdentity {
  const keypair = nacl.sign.keyPair();
  const publicKeyBase58 = bs58.encode(keypair.publicKey);
  const address = generateCallAddress(keypair.publicKey);
  
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    address,
    publicKeyBase58
  };
}

export function generateCallAddress(publicKey: Uint8Array): string {
  const randomBytes = nacl.randomBytes(8);
  const pubKeyB58 = bs58.encode(publicKey);
  const randomB58 = bs58.encode(randomBytes);
  return `call:${pubKeyB58}:${randomB58}`;
}

export function saveIdentity(identity: CryptoIdentity): void {
  const serialized = {
    publicKey: Array.from(identity.publicKey),
    secretKey: Array.from(identity.secretKey),
    address: identity.address,
    publicKeyBase58: identity.publicKeyBase58
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
}

export function loadIdentity(): CryptoIdentity | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    const parsed = JSON.parse(stored);
    return {
      publicKey: new Uint8Array(parsed.publicKey),
      secretKey: new Uint8Array(parsed.secretKey),
      address: parsed.address,
      publicKeyBase58: parsed.publicKeyBase58
    };
  } catch {
    return null;
  }
}

export function rotateAddress(identity: CryptoIdentity): CryptoIdentity {
  const newAddress = generateCallAddress(identity.publicKey);
  const updated = { ...identity, address: newAddress };
  saveIdentity(updated);
  return updated;
}

export function signCallIntent(intent: CallIntent, secretKey: Uint8Array): SignedCallIntent {
  const sortedIntent = JSON.stringify(intent, Object.keys(intent).sort());
  const message = new TextEncoder().encode(sortedIntent);
  const signature = nacl.sign.detached(message, secretKey);
  
  return {
    intent,
    signature: bs58.encode(signature)
  };
}

export function generateNonce(): string {
  return bs58.encode(nacl.randomBytes(16));
}

export async function signMessage(identity: CryptoIdentity, message: Message): Promise<SignedMessage> {
  const sortedMessage = JSON.stringify(message, Object.keys(message).sort());
  const messageBytes = new TextEncoder().encode(sortedMessage);
  const signature = nacl.sign.detached(messageBytes, identity.secretKey);
  
  return {
    message,
    signature: bs58.encode(signature),
    from_pubkey: identity.publicKeyBase58
  };
}

export function signPayload(secretKey: Uint8Array, payload: object): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  const bytes = new TextEncoder().encode(sorted);
  const sig = nacl.sign.detached(bytes, secretKey);
  return bs58.encode(sig);
}

export function exportIdentity(identity: CryptoIdentity): string {
  const exportData = {
    version: 1,
    publicKey: bs58.encode(identity.publicKey),
    secretKey: bs58.encode(identity.secretKey),
    address: identity.address,
    publicKeyBase58: identity.publicKeyBase58,
    exportedAt: new Date().toISOString(),
  };
  return btoa(JSON.stringify(exportData));
}

export function importIdentity(backupString: string): CryptoIdentity | null {
  try {
    const decoded = atob(backupString.trim());
    const parsed = JSON.parse(decoded);
    
    if (!parsed.publicKey || !parsed.secretKey || !parsed.address) {
      throw new Error('Invalid backup format');
    }
    
    const identity: CryptoIdentity = {
      publicKey: bs58.decode(parsed.publicKey),
      secretKey: bs58.decode(parsed.secretKey),
      address: parsed.address,
      publicKeyBase58: parsed.publicKeyBase58 || bs58.encode(bs58.decode(parsed.publicKey)),
    };
    
    // Verify the keypair is valid by checking that the public key matches
    const derivedPubKey = identity.secretKey.slice(32);
    if (bs58.encode(derivedPubKey) !== bs58.encode(identity.publicKey)) {
      throw new Error('Invalid keypair');
    }
    
    saveIdentity(identity);
    return identity;
  } catch (error) {
    console.error('Failed to import identity:', error);
    return null;
  }
}

// Recover identity from private key (secret key) directly
// This allows users to restore their identity using just the private key
// The Ed25519 secret key contains both the seed (32 bytes) and public key (32 bytes)
// IMPORTANT: This now looks up the original address from the server to preserve data
export async function recoverIdentityFromPrivateKey(privateKeyBase58: string): Promise<CryptoIdentity | null> {
  try {
    const secretKey = bs58.decode(privateKeyBase58.trim());
    
    // Ed25519 secret key is 64 bytes: 32-byte seed + 32-byte public key
    if (secretKey.length !== 64) {
      console.error('Invalid private key length:', secretKey.length, 'expected 64');
      return null;
    }
    
    // Extract public key from the secret key (last 32 bytes)
    const publicKey = secretKey.slice(32);
    const publicKeyBase58 = bs58.encode(publicKey);
    
    // Look up the original address from the server (to preserve contacts/messages)
    let address: string;
    try {
      const response = await fetch(`/api/identity/lookup/${encodeURIComponent(publicKeyBase58)}`);
      const data = await response.json();
      if (data.exists && data.address) {
        console.log('[Recovery] Found existing address:', data.address.slice(0, 20) + '...');
        address = data.address;
      } else {
        console.log('[Recovery] No existing address found, generating new one');
        address = generateCallAddress(publicKey);
      }
    } catch (lookupError) {
      console.warn('[Recovery] Failed to lookup address, generating new one:', lookupError);
      address = generateCallAddress(publicKey);
    }
    
    const identity: CryptoIdentity = {
      publicKey,
      secretKey,
      address,
      publicKeyBase58,
    };
    
    saveIdentity(identity);
    return identity;
  } catch (error) {
    console.error('Failed to recover identity from private key:', error);
    return null;
  }
}

// Get the private key (secret key) in base58 format for export
export function getPrivateKeyBase58(identity: CryptoIdentity): string {
  return bs58.encode(identity.secretKey);
}

// Identity Vault - PIN-based encryption for cross-browser sync

export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptIdentityForVault(
  identity: CryptoIdentity, 
  pin: string
): Promise<{ encryptedData: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPin(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const dataToEncrypt = JSON.stringify({
    publicKey: bs58.encode(identity.publicKey),
    secretKey: bs58.encode(identity.secretKey),
    address: identity.address,
    publicKeyBase58: identity.publicKeyBase58,
  });
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(dataToEncrypt)
  );
  
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return {
    encryptedData: bs58.encode(combined),
    salt: bs58.encode(salt),
  };
}

export async function decryptIdentityFromVault(
  encryptedData: string,
  salt: string,
  pin: string
): Promise<CryptoIdentity | null> {
  try {
    const saltBytes = bs58.decode(salt);
    const key = await deriveKeyFromPin(pin, saltBytes);
    
    const combined = bs58.decode(encryptedData);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const parsed = JSON.parse(new TextDecoder().decode(decrypted));
    
    return {
      publicKey: bs58.decode(parsed.publicKey),
      secretKey: bs58.decode(parsed.secretKey),
      address: parsed.address,
      publicKeyBase58: parsed.publicKeyBase58,
    };
  } catch (error) {
    console.error('Failed to decrypt identity vault:', error);
    return null;
  }
}
