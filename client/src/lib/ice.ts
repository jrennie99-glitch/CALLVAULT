/**
 * ICE Configuration Helper
 * Fetches dynamic TURN credentials from /api/ice endpoint
 * Uses coturn shared-secret authentication (HMAC-SHA1)
 */

export interface IceConfig {
  iceServers: RTCIceServer[];
  mode: string;
  ttl?: number;
  username?: string;
}

let cachedConfig: IceConfig | null = null;
let cacheExpiry = 0;

/**
 * Fetch ICE configuration from /api/ice endpoint
 * Caches result for 5 minutes to avoid unnecessary requests
 */
export async function fetchIceConfig(): Promise<IceConfig> {
  const now = Date.now();
  
  // Return cached config if still valid (5 min cache)
  if (cachedConfig && cacheExpiry > now) {
    return cachedConfig;
  }
  
  try {
    const res = await fetch('/api/ice');
    if (!res.ok) {
      throw new Error(`Failed to fetch ICE config: ${res.status}`);
    }
    
    const data = await res.json();
    cachedConfig = data;
    cacheExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
    
    console.log('[ICE] Fetched ICE config:', data.mode, data.iceServers?.length, 'servers');
    return data;
  } catch (error) {
    console.error('[ICE] Failed to fetch ICE config:', error);
    // Fallback to basic STUN if fetch fails
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      mode: 'stun_fallback'
    };
  }
}

/**
 * Create RTCPeerConnection configuration with dynamic ICE servers
 * @param forceRelay - If true, uses iceTransportPolicy: "relay" to force TURN
 */
export async function createRTCConfiguration(forceRelay = false): Promise<RTCConfiguration> {
  const iceConfig = await fetchIceConfig();
  
  const config: RTCConfiguration = {
    iceServers: iceConfig.iceServers
  };
  
  // Force TURN relay if requested (useful for testing or restrictive networks)
  if (forceRelay && iceConfig.mode === 'coturn_shared_secret') {
    config.iceTransportPolicy = 'relay';
    console.log('[ICE] Forcing TURN relay mode');
  }
  
  return config;
}

/**
 * Clear cached ICE config (call after credential issues)
 */
export function clearIceCache(): void {
  cachedConfig = null;
  cacheExpiry = 0;
}
