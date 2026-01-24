import { getBiometricCredential, saveBiometricCredential, clearBiometricCredential } from './storage';

export function isBiometricSupported(): boolean {
  return !!(window.PublicKeyCredential && 
    typeof window.PublicKeyCredential === 'function');
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  
  // In iframe context (like Replit preview), WebAuthn won't work
  // But on iOS devices we know they support it, so return true to allow attempt
  if (isInIframe() && isIOS()) {
    return true; // Allow iOS users to try - they'll get a prompt to open in Safari
  }
  
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
          name: 'CallVS',
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: 'callvs-user',
          displayName: 'CallVS User'
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
  } catch (error: any) {
    console.error('Biometric enrollment failed:', error);
    
    // Provide better error messages for common issues
    if (isInIframe()) {
      throw new Error('Face ID/Touch ID requires opening this app directly in Safari. Tap "Open in browser" or add to Home Screen.');
    }
    
    if (error.name === 'NotAllowedError') {
      throw new Error('Face ID/Touch ID was cancelled or not allowed. Please try again.');
    }
    
    if (error.name === 'SecurityError') {
      throw new Error('Security error. Please ensure you are using HTTPS.');
    }
    
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
