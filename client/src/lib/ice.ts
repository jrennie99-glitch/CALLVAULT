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
 * - DTLS-SRTP is enforced automatically by WebRTC for all media
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

export interface ConnectionStats {
  usingRelay: boolean;
  candidateType: string;
  protocol: string;
  localAddress?: string;
  remoteAddress?: string;
  bytesSent: number;
  bytesReceived: number;
  dtlsState?: string;
  selectedCandidatePair?: any;
}

let cachedConfig: IceConfig | null = null;
let cacheExpiry = 0;

/**
 * Fetch ICE configuration from /api/ice endpoint
 * NO FALLBACK - must always use /api/ice as single source of truth
 * Throws error if fetch fails to ensure proper error handling upstream
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
      throw new Error(`Failed to fetch ICE config: ${res.status} ${res.statusText}`);
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
    
    if (iceServers.length === 0) {
      throw new Error('No ICE servers returned from /api/ice');
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
  } catch (error) {
    console.error('[ICE] Failed to fetch ICE config:', error);
    // Clear any stale cache on error
    cachedConfig = null;
    cacheExpiry = 0;
    throw error; // Propagate error to caller for proper handling
  }
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

/**
 * Validate TURN relay usage via WebRTC statistics
 * Call this after connection is established to verify relay is being used
 * 
 * @param pc - Active RTCPeerConnection
 * @returns Promise<ConnectionStats> with relay validation info
 */
export async function validateTurnRelay(pc: RTCPeerConnection): Promise<ConnectionStats> {
  const stats = await pc.getStats();
  let result: ConnectionStats = {
    usingRelay: false,
    candidateType: 'unknown',
    protocol: 'unknown',
    bytesSent: 0,
    bytesReceived: 0
  };

  // Find the active candidate pair
  let activeCandidatePair: any = null;
  stats.forEach((report) => {
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      activeCandidatePair = report;
    }
  });

  if (!activeCandidatePair) {
    console.warn('[ICE] No active candidate pair found');
    return result;
  }

  result.selectedCandidatePair = activeCandidatePair;
  result.bytesSent = activeCandidatePair.bytesSent || 0;
  result.bytesReceived = activeCandidatePair.bytesReceived || 0;

  // Get local candidate details
  let localCandidate: any = null;
  stats.forEach((report) => {
    if (report.type === 'local-candidate' && report.id === activeCandidatePair.localCandidateId) {
      localCandidate = report;
    }
  });

  // Get remote candidate details
  let remoteCandidate: any = null;
  stats.forEach((report) => {
    if (report.type === 'remote-candidate' && report.id === activeCandidatePair.remoteCandidateId) {
      remoteCandidate = report;
    }
  });

  if (localCandidate) {
    result.candidateType = localCandidate.candidateType || 'unknown';
    result.protocol = localCandidate.protocol || 'unknown';
    result.localAddress = `${localCandidate.address || '?'}:${localCandidate.port || '?'}`;
    
    // Check if using TURN relay
    result.usingRelay = localCandidate.candidateType === 'relay';
  }

  if (remoteCandidate) {
    result.remoteAddress = `${remoteCandidate.address || '?'}:${remoteCandidate.port || '?'}`;
  }

  // Get DTLS state for security validation
  stats.forEach((report) => {
    if (report.type === 'transport') {
      result.dtlsState = report.dtlsState;
    }
  });

  console.log('[ICE] Connection stats:', {
    usingRelay: result.usingRelay,
    candidateType: result.candidateType,
    protocol: result.protocol,
    dtlsState: result.dtlsState,
    bytesSent: result.bytesSent,
    bytesReceived: result.bytesReceived
  });

  return result;
}

/**
 * Verify security of the connection
 * Ensures DTLS-SRTP is active and connection is encrypted
 * Logs warnings but does not fail if relay is not used (for monitoring)
 * 
 * @param pc - Active RTCPeerConnection
 * @returns Promise<boolean> - true if DTLS is connected (encrypted)
 */
export async function verifyConnectionSecurity(pc: RTCPeerConnection): Promise<boolean> {
  const stats = await validateTurnRelay(pc);
  
  // DTLS must be in 'connected' state for encryption to be active
  if (stats.dtlsState !== 'connected') {
    console.error('[Security] DTLS not in connected state:', stats.dtlsState);
    return false;
  }
  
  // Log warning if not using relay (monitoring only, doesn't fail verification)
  if (!stats.usingRelay) {
    console.warn('[Security] ⚠ Not using TURN relay - connection may fail in restrictive NAT');
  } else {
    console.log('[Security] ✓ Using TURN relay - optimal for NAT traversal');
  }
  
  console.log('[Security] ✓ Connection is encrypted - DTLS-SRTP active, ephemeral keys established');
  return true;
}
