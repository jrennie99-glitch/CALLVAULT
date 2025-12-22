import { Capacitor } from '@capacitor/core';

export const IS_NATIVE = Capacitor.isNativePlatform();

export const PLATFORM = Capacitor.getPlatform();

export const IS_IOS = PLATFORM === 'ios';

export const IS_ANDROID = PLATFORM === 'android';

export const IS_WEB = PLATFORM === 'web';

export function getPlatformInfo() {
  return {
    isNative: IS_NATIVE,
    platform: PLATFORM,
    isIOS: IS_IOS,
    isAndroid: IS_ANDROID,
    isWeb: IS_WEB,
  };
}
