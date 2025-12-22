export interface FeatureFlags {
  E2E_ENCRYPTION_INDICATOR: boolean;
  EMOJI_REACTIONS: boolean;
}

const defaultFlags: FeatureFlags = {
  E2E_ENCRYPTION_INDICATOR: true,
  EMOJI_REACTIONS: true,
};

const FLAGS_KEY = 'cv_feature_flags';

let cachedFlags: FeatureFlags | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getFeatureFlags(): FeatureFlags {
  if (cachedFlags) return cachedFlags;
  
  if (!isBrowser()) {
    return defaultFlags;
  }
  
  try {
    const stored = localStorage.getItem(FLAGS_KEY);
    if (stored) {
      const parsed = { ...defaultFlags, ...JSON.parse(stored) };
      cachedFlags = parsed;
      return parsed;
    }
  } catch {}
  
  cachedFlags = defaultFlags;
  return defaultFlags;
}

export function setFeatureFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  if (!isBrowser()) return;
  
  const flags = getFeatureFlags();
  flags[key] = value;
  cachedFlags = flags;
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
}

export function isFeatureEnabled(key: keyof FeatureFlags): boolean {
  return getFeatureFlags()[key];
}
