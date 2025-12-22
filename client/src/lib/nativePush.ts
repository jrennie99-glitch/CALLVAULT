import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import type { CryptoIdentity } from '@shared/types';

export const IS_NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform();

let currentToken: string | null = null;

export async function initializeNativePush(identity: CryptoIdentity): Promise<boolean> {
  if (!IS_NATIVE) {
    console.log('Not a native platform, skipping native push initialization');
    return false;
  }

  try {
    const permStatus = await PushNotifications.checkPermissions();
    
    if (permStatus.receive === 'prompt') {
      const result = await PushNotifications.requestPermissions();
      if (result.receive !== 'granted') {
        console.log('Push notification permission denied');
        return false;
      }
    } else if (permStatus.receive !== 'granted') {
      console.log('Push notification permission not granted');
      return false;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token:', token.value);
      currentToken = token.value;
      await registerTokenWithServer(identity, token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err.error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action performed:', action);
      const data = action.notification.data;
      
      if (data?.type === 'incoming_call' && data?.url) {
        window.location.href = data.url;
      }
    });

    return true;
  } catch (error) {
    console.error('Error initializing native push:', error);
    return false;
  }
}

async function registerTokenWithServer(identity: CryptoIdentity, token: string): Promise<void> {
  try {
    const timestamp = Date.now().toString();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const message = `push-register:${identity.address}:${PLATFORM}:${token}:${timestamp}:${nonce}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(messageBytes, identity.secretKey);
    const signature = bs58.encode(signatureBytes);

    const deviceInfo = JSON.stringify({
      platform: PLATFORM,
      model: navigator.userAgent,
    });

    const response = await fetch('/api/push/native/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: identity.address,
        platform: PLATFORM,
        token,
        deviceInfo,
        appVersion: '1.0.0',
        signature,
        timestamp,
        nonce,
      }),
    });

    if (response.ok) {
      console.log('Native push token registered with server');
    } else {
      console.error('Failed to register push token with server');
    }
  } catch (error) {
    console.error('Error registering token with server:', error);
  }
}

export async function unregisterNativePush(identity: CryptoIdentity): Promise<void> {
  if (!IS_NATIVE || !currentToken) return;

  try {
    const timestamp = Date.now().toString();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const message = `push-unregister:${identity.address}:${currentToken}:${timestamp}:${nonce}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(messageBytes, identity.secretKey);
    const signature = bs58.encode(signatureBytes);

    await fetch('/api/push/native/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: identity.address,
        token: currentToken,
        signature,
        timestamp,
        nonce,
      }),
    });

    await PushNotifications.unregister();
    currentToken = null;
    console.log('Native push unregistered');
  } catch (error) {
    console.error('Error unregistering native push:', error);
  }
}

export function getCurrentToken(): string | null {
  return currentToken;
}

export async function checkNativePushPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!IS_NATIVE) return 'denied';
  
  try {
    const result = await PushNotifications.checkPermissions();
    return result.receive as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'denied';
  }
}
