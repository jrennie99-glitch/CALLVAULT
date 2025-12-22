function getCapacitorSafe() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor;
  } catch {
    return null;
  }
}

const Capacitor = getCapacitorSafe();

export const IS_NATIVE = Capacitor?.isNativePlatform?.() ?? false;

export const PLATFORM = Capacitor?.getPlatform?.() ?? 'web';

export const IS_IOS = PLATFORM === 'ios';

export const IS_ANDROID = PLATFORM === 'android';

export const IS_WEB = PLATFORM === 'web' || !IS_NATIVE;

export function getPlatformInfo() {
  return {
    isNative: IS_NATIVE,
    platform: PLATFORM,
    isIOS: IS_IOS,
    isAndroid: IS_ANDROID,
    isWeb: IS_WEB,
  };
}
