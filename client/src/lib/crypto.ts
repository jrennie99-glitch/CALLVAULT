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
