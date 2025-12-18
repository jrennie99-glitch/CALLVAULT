import { getBiometricCredential, saveBiometricCredential, clearBiometricCredential } from './storage';

export function isBiometricSupported(): boolean {
  return !!(window.PublicKeyCredential && 
    typeof window.PublicKeyCredential === 'function');
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function enrollBiometric(): Promise<boolean> {
  if (!(await isPlatformAuthenticatorAvailable())) {
    throw new Error('Biometric authentication not available on this device');
  }

  try {
    const challenge = generateChallenge();
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Crypto Call',
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: 'crypto-call-user',
          displayName: 'Crypto Call User'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    const credentialId = bufferToBase64(credential.rawId);
    saveBiometricCredential(credentialId);
    return true;
  } catch (error) {
    console.error('Biometric enrollment failed:', error);
    throw error;
  }
}

export async function verifyBiometric(): Promise<boolean> {
  const credentialId = getBiometricCredential();
  if (!credentialId) {
    throw new Error('No biometric credential enrolled');
  }

  try {
    const challenge = generateChallenge();
    const allowCredentials = [{
      id: base64ToBuffer(credentialId),
      type: 'public-key' as const,
      transports: ['internal' as const]
    }];

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000,
        rpId: window.location.hostname
      }
    }) as PublicKeyCredential | null;

    return !!assertion;
  } catch (error) {
    console.error('Biometric verification failed:', error);
    throw error;
  }
}

export async function disableBiometric(): Promise<void> {
  clearBiometricCredential();
}
