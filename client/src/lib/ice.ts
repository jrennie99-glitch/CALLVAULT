/**
 * ICE Configuration Helper
 * Fetches dynamic TURN credentials from /api/ice endpoint
 * Uses coturn shared-secret authentication (HMAC-SHA1)
 * 
 * PRODUCTION REQUIREMENTS:
 * - MUST wait for /api/ice before creating RTCPeerConnection
 * - NO hardcoded ICE servers (use /api/ice exclusively)
 * - NO fallback to browser defaults
 * - Enforce relay policy for production TURN servers
 */

export interface IceApiResponse {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
  mode: string;
  iceServers?: RTCIceServer[]; // Alternative format from server
}

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
 * NO FALLBACK - must always use /api/ice as single source of truth
 */
export async function fetchIceConfig(): Promise<IceConfig> {
  const now = Date.now();
  
  // Return cached config if still valid (5 min cache)
  if (cachedConfig && cacheExpiry > now) {
    return cachedConfig;
  }
  
  const res = await fetch('/api/ice');
  if (!res.ok) {
    throw new Error(`Failed to fetch ICE config: ${res.status}`);
  }
  
  const data: IceApiResponse = await res.json();
  
  // Build ICE servers from API response
  const iceServers: RTCIceServer[] = [];
  
  // Use iceServers array if provided by server
  if (data.iceServers && Array.isArray(data.iceServers)) {
    iceServers.push(...data.iceServers);
  } else if (data.urls && data.urls.length > 0) {
    // Build from flat format (urls, username, credential)
    iceServers.push({
      urls: data.urls,
      username: data.username,
      credential: data.credential
    });
  }
  
  cachedConfig = {
    iceServers,
    mode: data.mode,
    ttl: data.ttl,
    username: data.username
  };
  cacheExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
  
  console.log('[ICE] Fetched ICE config:', data.mode, iceServers.length, 'server(s)');
  return cachedConfig;
}

/**
 * Create RTCPeerConnection with production-ready configuration
 * MUST be called and awaited before creating RTCPeerConnection
 * 
 * @returns Promise<RTCPeerConnection> configured with proper ICE servers and policies
 */
export async function createPeerConnection(): Promise<RTCPeerConnection> {
  const iceConfig = await fetchIceConfig();
  
  const rtcConfig: RTCConfiguration = {
    iceServers: iceConfig.iceServers,
    iceTransportPolicy: 'relay', // MANDATORY: Force TURN relay for production
    bundlePolicy: 'max-bundle',   // Optimize bandwidth
    rtcpMuxPolicy: 'require'      // Required for modern WebRTC
  };
  
  console.log('[ICE] Creating RTCPeerConnection with relay-only policy');
  return new RTCPeerConnection(rtcConfig);
}

/**
 * Clear cached ICE config (call after credential issues)
 */
export function clearIceCache(): void {
  cachedConfig = null;
  cacheExpiry = 0;
}
