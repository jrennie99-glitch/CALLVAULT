import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  SwitchCamera,
  PhoneCall,
  PhoneIncoming,
  Phone,
  User,
  Wifi,
  Radio,
  Zap,
  Lock
} from 'lucide-react';
import * as crypto from '@/lib/crypto';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { createPeerConnection as createPeerConnectionWithICE, validateTurnRelay, verifyConnectionSecurity } from '@/lib/ice';
import { addCallRecord, getContactByAddress } from '@/lib/storage';
import { getErrorMessage, getToastMessage, isRetryableError } from '@/lib/errorMessages';
import type { CryptoIdentity, WSMessage } from '@shared/types';

type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
type ConnectionRoute = 'unknown' | 'direct' | 'relay';
type IceCandidateType = 'unknown' | 'host' | 'srflx' | 'prflx' | 'relay';

interface CallSessionToken {
  token: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  serverTime: number;
  plan: string;
  allowTurn: boolean;
  allowVideo: boolean;
  turnConfigured: boolean;
  iceServers: RTCIceServer[];
}

// Helper to get server-adjusted timestamp
function getServerAdjustedTimestamp(serverTimeOffset: number): number {
  return Date.now() + serverTimeOffset;
}

interface CallViewProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  destinationAddress: string;
  isVideoCall: boolean;
  isInitiator: boolean;
  onCallEnd: () => void;
  iceServers: RTCIceServer[];
}

export function CallView({
  identity,
  ws,
  destinationAddress,
  isVideoCall: initialIsVideo,
  isInitiator,
  onCallEnd,
  iceServers
}: CallViewProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isVideoCall, setIsVideoCall] = useState(initialIsVideo);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialIsVideo);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  // STUN-first, TURN fallback state
  const [connectionRoute, setConnectionRoute] = useState<ConnectionRoute>('unknown');
  const [iceCandidateType, setIceCandidateType] = useState<IceCandidateType>('unknown');
  const [callSession, setCallSession] = useState<CallSessionToken | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isRetryingWithTurn, setIsRetryingWithTurn] = useState(false);
  const [currentIceServers, setCurrentIceServers] = useState<RTCIceServer[]>(iceServers);
  
  // Server time synchronization for reliable timestamps
  const serverTimeOffsetRef = useRef<number>(0);
  const callRetryCountRef = useRef<number>(0);
  const MAX_CALL_RETRIES = 3; // Silent retries with exponential backoff
  const RETRY_DELAYS = [200, 600, 1200]; // Exponential backoff: 200ms, 600ms, 1200ms
  
  // Connection handshake failure state (shown after all retries exhausted)
  const [showHandshakeError, setShowHandshakeError] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAddressRef = useRef<string>(destinationAddress);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const stunFailureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedTurnFallbackRef = useRef<boolean>(false);
  const maxReconnectAttempts = 3;
  const STUN_FAILURE_TIMEOUT = 8000; // 8 seconds before TURN fallback
  
  // Message buffer for early WebRTC messages (to handle race conditions)
  const messageBufferRef = useRef<WSMessage[]>([]);
  const peerConnectionReadyRef = useRef<boolean>(false);
  
  // Ringback tone for caller (plays while waiting for answer)
  useEffect(() => {
    if (callState === 'calling' || callState === 'ringing') {
      console.log('[CallView] callState is', callState, '- starting ringback');
      import('@/lib/audio').then(({ playRingback }) => {
        playRingback();
        console.log('[CallView] playRingback() called');
      });
    } else {
      console.log('[CallView] callState is', callState, '- stopping ringback');
      import('@/lib/audio').then(({ stopRingback }) => {
        stopRingback();
      });
    }
    
    return () => {
      import('@/lib/audio').then(({ stopRingback }) => {
        stopRingback();
      });
    };
  }, [callState]);

  // CRITICAL: Attach WebSocket listener FIRST (before peer connection setup)
  // This prevents race conditions where early webrtc:offer messages are missed
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: MessageEvent) => {
      const message: WSMessage = JSON.parse(event.data);
      
      // Buffer WebRTC signaling messages if peer connection isn't ready yet
      const isWebRTCMessage = message.type === 'webrtc:offer' || 
                              message.type === 'webrtc:answer' || 
                              message.type === 'webrtc:ice';
      
      if (isWebRTCMessage && !peerConnectionReadyRef.current) {
        console.log('[CallView] Buffering early message:', message.type);
        messageBufferRef.current.push(message);
        return;
      }
      
      await handleWebSocketMessage(message);
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  // Helper to wait for WebSocket to be ready (OPEN state)
  const waitForWebSocketReady = (socket: WebSocket, timeoutMs: number = 5000): Promise<boolean> => {
    return new Promise((resolve) => {
      if (socket.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        resolve(false);
        return;
      }
      
      // WebSocket is still CONNECTING - wait for it to open
      const timeout = setTimeout(() => {
        console.warn('[CallView] WebSocket ready timeout');
        resolve(false);
      }, timeoutMs);
      
      const onOpen = () => {
        clearTimeout(timeout);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        console.log('[CallView] WebSocket now ready');
        resolve(true);
      };
      
      const onError = () => {
        clearTimeout(timeout);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        resolve(false);
      };
      
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
    });
  };

  // Initialize call AFTER WebSocket listener is attached AND socket is ready
  useEffect(() => {
    remoteAddressRef.current = destinationAddress;
    
    const startCall = async () => {
      if (!ws) return;
      
      // Wait for WebSocket to be in OPEN state before initiating
      const isReady = await waitForWebSocketReady(ws);
      if (!isReady) {
        console.error('[CallView] WebSocket not ready, cannot initiate call');
        toast.error('Connection not ready. Please try again.');
        handleEndCall();
        return;
      }
      
      console.log('[CallView] WebSocket ready, initiating call...');
      
      if (destinationAddress && isInitiator) {
        initiateCall();
      } else if (!isInitiator) {
        // Callee: Set to 'connecting' - actual 'connected' state will be set by RTCPeerConnection handlers
        setCallState('connecting');
        setConnectionStatus('Connecting...');
        initiatePeerConnection(false);
      }
    };
    
    startCall();
    
    return () => {
      cleanupCall();
    };
  }, []);

  const startCallTimer = () => {
    setCallDuration(0);
    callStartTimeRef.current = Date.now();
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    return callDuration;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Fetch call session token with plan-based permissions
  const fetchCallSessionToken = async (): Promise<CallSessionToken | null> => {
    try {
      const targetAddr = remoteAddressRef.current || destinationAddress;
      const res = await fetch('/api/call-session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: identity.address,
          targetAddress: targetAddr
        })
      });
      if (!res.ok) {
        console.error('Failed to fetch call session token');
        return null;
      }
      const token = await res.json();
      console.log('[CallView] Call session token received:', {
        allowTurn: token.allowTurn,
        turnConfigured: token.turnConfigured,
        iceServersCount: token.iceServers?.length || 0
      });
      setCallSession(token);
      return token;
    } catch (error) {
      console.error('Error fetching call session token:', error);
      return null;
    }
  };

  // Detect connection route from ICE candidate
  const detectConnectionRoute = (pc: RTCPeerConnection) => {
    pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCandidate = stats.get(report.localCandidateId);
          const remoteCandidate = stats.get(report.remoteCandidateId);
          if (localCandidate) {
            const candidateType = localCandidate.candidateType as IceCandidateType;
            setIceCandidateType(candidateType || 'unknown');
            
            // Log ICE candidate details for debugging
            console.log(`[ICE] Connection established via ${candidateType}`, {
              local: {
                type: candidateType,
                protocol: localCandidate.protocol,
                address: localCandidate.address,
                port: localCandidate.port
              },
              remote: remoteCandidate ? {
                type: remoteCandidate.candidateType,
                protocol: remoteCandidate.protocol,
                address: remoteCandidate.address,
                port: remoteCandidate.port
              } : 'unknown'
            });
            
            if (candidateType === 'relay') {
              setConnectionRoute('relay');
              console.log('[ICE] Using TURN relay - connection going through relay server');
            } else if (candidateType === 'host' || candidateType === 'srflx' || candidateType === 'prflx') {
              setConnectionRoute('direct');
              console.log(`[ICE] Direct connection - ${candidateType === 'host' ? 'local network' : 'NAT traversal via STUN'}`);
            }
          }
        }
      });
    }).catch(console.error);
  };

  // Handle STUN failure - attempt TURN fallback for paid users
  const handleStunFailure = async () => {
    if (hasAttemptedTurnFallbackRef.current) return;
    hasAttemptedTurnFallbackRef.current = true;

    // Clear the failure timer
    clearStunFailureTimer();

    // Check if user can use TURN
    if (callSession?.allowTurn && callSession.turnConfigured) {
      // Paid user - rebuild connection with TURN servers
      setIsRetryingWithTurn(true);
      setConnectionStatus('Improving connection...');
      toast.info('Improving connection...', { duration: 2000 });
      
      // Must rebuild peer connection to use fresh ICE servers
      // (ICE servers cannot be changed after RTCPeerConnection is created)
      try {
        // Close old connection but keep media stream
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
        
        // Rebuild with fresh configuration from /api/ice
        const stream = localStreamRef.current;
        if (!stream) {
          throw new Error('No media stream available');
        }
        
        // Create new peer connection with relay-only policy
        const pc = await createPeerConnectionWithICE();
        peerConnectionRef.current = pc;
        
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
        
        setupPeerConnectionHandlers(pc, isInitiator);
        
        // Re-initiate the call immediately (instant call setup)
        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer); // Set immediately, ICE trickling happens after
          if (ws && remoteAddressRef.current) {
            ws.send(JSON.stringify({
              type: 'webrtc:offer',
              to_address: remoteAddressRef.current,
              offer: offer
            }));
          }
        }
      } catch (error) {
        console.error('TURN fallback failed:', error);
        toast.error('Connection failed');
      }
      setIsRetryingWithTurn(false);
    } else {
      // Free user - show upgrade modal
      setShowUpgradeModal(true);
    }
  };

  // Start STUN failure timer
  const startStunFailureTimer = () => {
    if (stunFailureTimerRef.current) {
      clearTimeout(stunFailureTimerRef.current);
    }
    stunFailureTimerRef.current = setTimeout(() => {
      const pc = peerConnectionRef.current;
      if (pc && (pc.iceConnectionState === 'checking' || pc.connectionState === 'connecting')) {
        handleStunFailure();
      }
    }, STUN_FAILURE_TIMEOUT);
  };

  // Clear STUN failure timer
  const clearStunFailureTimer = () => {
    if (stunFailureTimerRef.current) {
      clearTimeout(stunFailureTimerRef.current);
      stunFailureTimerRef.current = null;
    }
  };

  const handleWebSocketMessage = useCallback(async (message: WSMessage) => {
    switch (message.type) {
      case 'call:accept':
        // Set to 'connecting' - actual 'connected' state will be set by RTCPeerConnection handlers
        setCallState('connecting');
        setConnectionStatus('Connecting...');
        await initiatePeerConnection(true);
        break;

      case 'call:reject':
        toast.error('Call rejected');
        recordCall('missed');
        handleEndCall();
        break;

      case 'call:end':
        toast('Call ended');
        recordCall('outgoing', stopCallTimer());
        handleEndCall();
        break;

      case 'webrtc:offer':
        await handleOffer(message.offer);
        break;

      case 'webrtc:answer':
        await handleAnswer(message.answer);
        break;

      case 'webrtc:ice':
        await handleIceCandidate(message.candidate);
        break;

      case 'webrtc:peer_offline':
        // Peer went offline during signaling
        console.log(`[CallView] Peer offline during ${(message as any).signalType}`);
        if (callState === 'connecting' || callState === 'calling') {
          toast.error('Connection lost - peer went offline');
          recordCall('outgoing', 0);
          handleEndCall();
        }
        break;

      case 'call:unavailable':
        // Recipient is offline - they'll see the missed call when they come online
        toast('Recipient is currently unavailable. They will see your missed call.', { duration: 4000 });
        recordCall('outgoing', 0); // Record as brief outgoing call
        handleEndCall();
        break;

      case 'call:blocked': {
        // Handle call blocked errors with user-friendly messages
        const errorCode = (message as any).errorCode;
        const reason = (message as any).reason;
        
        if (errorCode) {
          const errorDetails = getErrorMessage(errorCode);
          toast.error(getToastMessage(errorCode), { 
            duration: errorDetails.duration 
          });
          
          // If it's a limit error, show upgrade modal
          if (errorCode.startsWith('LIMIT_') || errorCode === 'NOT_APPROVED_CONTACT' || 
              errorCode === 'GROUP_CALLS_NOT_ALLOWED' || errorCode === 'EXTERNAL_LINKS_NOT_ALLOWED') {
            setShowUpgradeModal(true);
          }
        } else {
          // Fallback to generic reason message
          toast.error(reason || 'Call blocked. Please try again later.', { duration: 5000 });
        }
        
        recordCall('outgoing', 0);
        handleEndCall();
        break;
      }

      case 'error':
        // Check if this is a signature/timestamp error that can be retried
        const errorMsg = message.message || '';
        const reason = (message as any).reason;
        if (errorMsg.includes('expired') || errorMsg.includes('signature') || errorMsg.includes('timestamp') || reason === 'token_expired') {
          handleCallError(errorMsg, reason);
        } else {
          toast.error(errorMsg);
          handleEndCall();
        }
        break;
    }
  }, []);

  const recordCall = (type: 'incoming' | 'outgoing' | 'missed', duration?: number) => {
    const contact = getContactByAddress(destinationAddress);
    addCallRecord({
      address: destinationAddress,
      contactId: contact?.id,
      contactName: contact?.name,
      type,
      mediaType: isVideoCall ? 'video' : 'audio',
      timestamp: Date.now(),
      duration
    });
  };

  // Fetch a fresh call token from the server (with server timestamps)
  const fetchCallToken = async (): Promise<CallSessionToken | null> => {
    try {
      const response = await fetch('/api/call-session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: identity.address,
          targetAddress: destinationAddress 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to get call token:', errorData);
        return null;
      }

      const tokenData: CallSessionToken = await response.json();
      
      // Calculate server time offset (server time - client time)
      serverTimeOffsetRef.current = tokenData.serverTime - Date.now();
      
      setCallSession(tokenData);
      setCurrentIceServers(tokenData.iceServers);
      
      return tokenData;
    } catch (error) {
      console.error('Error fetching call token:', error);
      return null;
    }
  };

  // Capture local media stream (for showing self-view during ringing)
  const captureLocalMedia = async (videoOnly: boolean = false) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: !videoOnly,
        video: isVideoCall ? { facingMode } : false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error: any) {
      console.error('Failed to get media devices:', error);
      
      // Handle specific permission errors with helpful messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        if (isVideoCall) {
          // Video call permission denied - offer audio-only fallback
          toast.error(getToastMessage('CAMERA_PERMISSION_DENIED'), { duration: 7000 });
          
          // Try fallback to audio-only
          if (!videoOnly) {
            console.log('[CallView] Camera denied, attempting audio-only fallback...');
            try {
              const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              localStreamRef.current = audioStream;
              setIsVideoCall(false);
              setIsVideoEnabled(false);
              toast.success('Switched to audio-only call', { duration: 3000 });
              return audioStream;
            } catch (audioError) {
              toast.error(getToastMessage('MICROPHONE_PERMISSION_DENIED'), { duration: 7000 });
            }
          }
        } else {
          toast.error(getToastMessage('MICROPHONE_PERMISSION_DENIED'), { duration: 7000 });
        }
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera or microphone found. Please connect a device.', { duration: 6000 });
      } else if (error.name === 'NotReadableError') {
        toast.error('Camera or microphone is already in use by another application.', { duration: 6000 });
      } else {
        toast.error('Failed to access camera/microphone. Please check your device settings.', { duration: 6000 });
      }
      return null;
    }
  };

  // Main call initiation - fetches fresh token then starts call
  const initiateCall = async () => {
    if (!identity || !ws) return;

    // Reset handshake error state on new attempt
    setShowHandshakeError(false);
    // Go straight to "Calling..." like WhatsApp - no intermediate states
    setCallState('calling');
    setConnectionStatus('Calling...');

    // Capture camera immediately for video calls so user sees themselves while ringing
    if (isVideoCall && !localStreamRef.current) {
      const stream = await captureLocalMedia();
      if (!stream) {
        handleEndCall();
        return;
      }
    }

    // Fetch fresh token from server (token generated at call time, not page load)
    // Every call attempt uses a fresh token/nonce
    const tokenData = await fetchCallToken();
    
    if (!tokenData) {
      // Check if we should retry silently with exponential backoff
      if (callRetryCountRef.current < MAX_CALL_RETRIES) {
        const delay = RETRY_DELAYS[callRetryCountRef.current] || 1200;
        callRetryCountRef.current++;
        console.log(`[CallToken] Token fetch failed, retrying (attempt ${callRetryCountRef.current}/${MAX_CALL_RETRIES}) after ${delay}ms...`);
        // Keep showing "Calling..." during retries - no state changes visible to user
        await new Promise(resolve => setTimeout(resolve, delay));
        return initiateCall();
      }
      
      // All retries exhausted - show handshake error with retry button
      console.error('[CallToken] All retry attempts exhausted for token fetch');
      setShowHandshakeError(true);
      return;
    }

    // Reset retry counter on success
    callRetryCountRef.current = 0;

    // Use server-adjusted timestamp for the call intent (using SERVER TIME)
    const serverAdjustedTime = getServerAdjustedTimestamp(serverTimeOffsetRef.current);

    // Generate fresh nonce for this specific call attempt
    const intent = {
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      to_address: destinationAddress,
      timestamp: serverAdjustedTime,
      nonce: crypto.generateNonce(), // Fresh nonce every call attempt
      media: {
        audio: true,
        video: isVideoCall
      }
    };

    const signedIntent = crypto.signCallIntent(intent, identity.secretKey);

    // Check WebSocket connection before sending
    if (ws.readyState !== WebSocket.OPEN) {
      console.error('[CallView] WebSocket not open, cannot initiate call. State:', ws.readyState);
      toast.error('Connection lost. Please refresh and try again.');
      setShowHandshakeError(true);
      return;
    }

    console.log('[CallView] Sending call:init to', destinationAddress.slice(0, 20) + '...');
    ws.send(JSON.stringify({
      type: 'call:init',
      data: signedIntent,
      callToken: tokenData.token // Include token for server-side validation
    }));

    console.log('[CallView] call:init sent - waiting for recipient response');
  };
  
  // Handle call errors with silent retry logic (3 retries with exponential backoff)
  const handleCallError = async (errorMessage: string, reason?: string) => {
    // Check if this is a retryable error (expired token, signature, timestamp issues)
    const isRetryableError = 
      reason === 'token_expired' || 
      errorMessage.includes('expired') || 
      errorMessage.includes('signature') || 
      errorMessage.includes('timestamp');
    
    if (isRetryableError && callRetryCountRef.current < MAX_CALL_RETRIES) {
      const delay = RETRY_DELAYS[callRetryCountRef.current] || 1200;
      callRetryCountRef.current++;
      console.log(`[CallToken] Retryable error "${reason || errorMessage}", silently retrying (attempt ${callRetryCountRef.current}/${MAX_CALL_RETRIES}) after ${delay}ms...`);
      // Keep showing "Calling..." - no visible state changes during retries
      
      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Fetch fresh token and retry (never reuse tokens)
      return initiateCall();
    }
    
    // All retries exhausted - show handshake error with retry button (NOT a toast)
    console.error(`[CallToken] All retry attempts exhausted. Last error: ${reason || errorMessage}`);
    setShowHandshakeError(true);
  };
  
  // Retry handler for handshake error (fresh token on each tap)
  const handleRetryCall = () => {
    callRetryCountRef.current = 0; // Reset counter for new user-initiated attempt
    setShowHandshakeError(false);
    initiateCall(); // Will fetch fresh token
  };

  // STUN-only ICE servers (used for initial connection attempt)
  const STUN_ONLY_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Setup peer connection event handlers (defined before functions that use it)
  const setupPeerConnectionHandlers = (pc: RTCPeerConnection, isInit: boolean) => {
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setConnectionStatus('Connected');
      clearStunFailureTimer();
      startCallTimer();
      // Detect connection route after connection
      setTimeout(() => detectConnectionRoute(pc), 1000);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && ws && remoteAddressRef.current) {
        ws.send(JSON.stringify({
          type: 'webrtc:ice',
          to_address: remoteAddressRef.current,
          candidate: event.candidate.toJSON()
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
      switch (pc.connectionState) {
        case 'connecting':
          setCallState('connecting');
          setConnectionStatus('Connecting...');
          startStunFailureTimer();
          break;
        case 'connected':
          setCallState('connected');
          setConnectionStatus('Connected');
          clearStunFailureTimer();
          reconnectAttemptsRef.current = 0;
          detectConnectionRoute(pc);
          break;
        case 'disconnected':
          setCallState('reconnecting');
          setConnectionStatus('Reconnecting...');
          attemptReconnect();
          break;
        case 'failed':
          // Check if we should attempt TURN fallback first
          if (!hasAttemptedTurnFallbackRef.current && callSession?.allowTurn) {
            handleStunFailure();
          } else if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            setCallState('reconnecting');
            setConnectionStatus('Reconnecting...');
            attemptReconnect();
          } else {
            setCallState('ended');
            setConnectionStatus('Connection failed');
            toast.error('Connection failed after multiple attempts');
            recordCall(isInit ? 'outgoing' : 'incoming', stopCallTimer());
            handleEndCall();
          }
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected') {
        setCallState('reconnecting');
        setConnectionStatus('Network interrupted...');
      } else if (pc.iceConnectionState === 'checking') {
        startStunFailureTimer();
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearStunFailureTimer();
        
        // Validate TURN relay usage and security when connection is established
        (async () => {
          try {
            const stats = await validateTurnRelay(pc);
            if (stats.usingRelay) {
              console.log('[Security] ✓ TURN relay active - NAT traversal working');
            } else {
              console.warn('[Security] ⚠ Not using TURN relay - may fail in restrictive NAT');
            }
            
            // Verify DTLS-SRTP encryption
            const isSecure = await verifyConnectionSecurity(pc);
            if (isSecure) {
              console.log('[Security] ✓ Connection encrypted with DTLS-SRTP');
            }
          } catch (error) {
            console.error('[Security] Failed to validate connection:', error);
          }
        })();
      }
    };
    
    // Add signaling state change logging for debugging
    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state: ${pc.signalingState}`);
    };
    
    // Add ICE gathering state logging
    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state: ${pc.iceGatheringState}`);
    };
  };

  const initiatePeerConnection = async (isInitiator: boolean) => {
    // Fetch call session token to get plan-based permissions
    const session = await fetchCallSessionToken();
    
    console.log('[CallView] Creating RTCPeerConnection with production config');
    
    try {
      // Reuse existing stream if already captured (e.g., for video calls during ringing)
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoCall ? { facingMode } : false,
          audio: true
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }

      // Create RTCPeerConnection with production-ready configuration
      // WAIT for /api/ice before creating connection (mandatory for production)
      const pc = await createPeerConnectionWithICE();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      setupPeerConnectionHandlers(pc, isInitiator);
      
      // Mark peer connection as ready and process any buffered messages
      peerConnectionReadyRef.current = true;
      console.log('[CallView] Peer connection ready, processing buffered messages...');
      
      // Process any messages that arrived before peer connection was ready
      while (messageBufferRef.current.length > 0) {
        const bufferedMsg = messageBufferRef.current.shift();
        if (bufferedMsg) {
          console.log('[CallView] Processing buffered message:', bufferedMsg.type);
          await handleWebSocketMessage(bufferedMsg);
        }
      }

      // Instant call setup: Create offer immediately if initiator
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer); // Set immediately, ICE trickling happens after
        if (ws && remoteAddressRef.current) {
          ws.send(JSON.stringify({
            type: 'webrtc:offer',
            to_address: remoteAddressRef.current,
            offer: offer
          }));
        }
      }
    } catch (error) {
      console.error('Failed to get media devices:', error);
      toast.error('Failed to access camera/microphone');
      handleEndCall();
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      await initiatePeerConnection(false);
    }

    const pc = peerConnectionRef.current!;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (ws && remoteAddressRef.current) {
      ws.send(JSON.stringify({
        type: 'webrtc:answer',
        to_address: remoteAddressRef.current,
        answer: answer
      }));
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const attemptReconnect = async () => {
    reconnectAttemptsRef.current += 1;
    const pc = peerConnectionRef.current;
    
    if (!pc) {
      await initiatePeerConnection(isInitiator);
      return;
    }

    try {
      if ('restartIce' in pc && typeof pc.restartIce === 'function') {
        pc.restartIce();
        
        if (isInitiator) {
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          if (ws && remoteAddressRef.current) {
            ws.send(JSON.stringify({
              type: 'webrtc:offer',
              to_address: remoteAddressRef.current,
              offer: offer
            }));
          }
        }
      } else {
        cleanupPeerConnection();
        await initiatePeerConnection(isInitiator);
      }
    } catch (error) {
      console.error('Reconnect failed:', error);
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        toast.error('Unable to reconnect');
        handleEndCall();
      }
    }
  };

  const cleanupPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      if (callState === 'reconnecting' || peerConnectionRef.current?.connectionState === 'disconnected') {
        toast('Network restored, reconnecting...');
        attemptReconnect();
      }
    };

    const handleOffline = () => {
      if (callState === 'connected') {
        setCallState('reconnecting');
        setConnectionStatus('Network lost...');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [callState]);

  const handleEndCall = () => {
    if (ws && remoteAddressRef.current) {
      ws.send(JSON.stringify({
        type: 'call:end',
        to_address: remoteAddressRef.current
      }));
    }
    cleanupCall();
    onCallEnd();
  };

  const cleanupCall = () => {
    stopCallTimer();
    clearStunFailureTimer();
    hasAttemptedTurnFallbackRef.current = false;
    
    // Reset message buffer and peer connection ready state
    peerConnectionReadyRef.current = false;
    messageBufferRef.current = [];
    
    // Stop all audio (ringback, ringtone) immediately
    import('@/lib/audio').then(({ stopAllAudio }) => {
      stopAllAudio();
    });
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    
    const videoTracks = localStreamRef.current.getVideoTracks();
    
    if (videoTracks.length === 0) {
      // No video tracks exist - need to acquire camera
      await enableVideoTrack();
      return;
    }
    
    // Toggle existing video tracks
    videoTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsVideoEnabled(!isVideoEnabled);
  };

  const enableVideoTrack = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      const newVideoTrack = videoStream.getVideoTracks()[0];
      
      if (!newVideoTrack) {
        toast.error('Could not access camera');
        return;
      }
      
      // Add track to local stream
      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newVideoTrack);
      }
      
      // Update local video preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      
      // Add track to peer connection for remote viewing
      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        } else {
          peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current!);
          
          // Trigger renegotiation
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'webrtc:offer',
              to_address: remoteAddressRef.current,
              offer: offer
            }));
          }
        }
      }
      
      setIsVideoEnabled(true);
      toast.success('Camera enabled');
    } catch (error) {
      console.error('Failed to enable video:', error);
      toast.error('Could not access camera');
    }
  };

  const upgradeToVideo = async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      const newVideoTrack = videoStream.getVideoTracks()[0];
      
      if (!newVideoTrack) {
        toast.error('Could not access camera');
        return;
      }
      
      // Add track to local stream
      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newVideoTrack);
      } else {
        localStreamRef.current = videoStream;
      }
      
      // Update local video preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      
      // Add track to peer connection and renegotiate
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
        
        // Trigger renegotiation so remote peer receives video
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'webrtc:offer',
            to_address: remoteAddressRef.current,
            offer: offer
          }));
        }
      }
      
      setIsVideoCall(true);
      setIsVideoEnabled(true);
      toast.success('Upgraded to video call');
    } catch (error) {
      console.error('Failed to upgrade to video:', error);
      toast.error('Could not access camera');
    }
  };

  const toggleSpeaker = async () => {
    const mediaElement = remoteVideoRef.current;
    if (!mediaElement) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (audioOutputs.length === 0) {
        setIsSpeakerOn(!isSpeakerOn);
        toast(isSpeakerOn ? 'Earpiece mode' : 'Speaker mode');
        return;
      }

      const element = mediaElement as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

      if (!element.setSinkId) {
        setIsSpeakerOn(!isSpeakerOn);
        toast(isSpeakerOn ? 'Earpiece mode' : 'Speaker mode');
        return;
      }

      const defaultDevice = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
      const speakerDevice = audioOutputs.find(d =>
        d.label.toLowerCase().includes('speaker') && d.deviceId !== 'default'
      );

      if (isSpeakerOn && speakerDevice) {
        await element.setSinkId(defaultDevice.deviceId);
        setIsSpeakerOn(false);
        toast('Switched to earpiece');
      } else {
        const targetDevice = speakerDevice || defaultDevice;
        await element.setSinkId(targetDevice.deviceId);
        setIsSpeakerOn(true);
        toast('Switched to speaker');
      }
    } catch (error) {
      setIsSpeakerOn(!isSpeakerOn);
    }
  };

  const switchCamera = async () => {
    if (!localStreamRef.current || !peerConnectionRef.current) return;

    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');

      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamRef.current.addTrack(newVideoTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      toast('Camera switched');
    } catch (error) {
      console.error('Failed to switch camera:', error);
      toast.error('Failed to switch camera');
    }
  };

  const contact = getContactByAddress(destinationAddress);
  const displayName = contact?.name || destinationAddress.slice(0, 20) + '...';

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      <div className="flex-1 relative">
        {isVideoCall ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              data-testid="video-remote"
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-4 right-4 w-28 h-20 sm:w-40 sm:h-28 object-cover rounded-xl border-2 border-slate-700 shadow-2xl"
              data-testid="video-local"
            />
          </>
        ) : (
          <>
            <audio ref={remoteVideoRef} autoPlay data-testid="audio-remote" />
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="text-center">
                <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 animate-pulse">
                  <User className="w-16 h-16 text-white" />
                </div>
                <p className="text-white text-xl font-medium mb-2">{displayName}</p>
                <p className="text-slate-400">Voice Call</p>
              </div>
            </div>
          </>
        )}

        <div className="absolute top-4 left-4 right-32 sm:right-44">
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl px-4 py-2 inline-block">
            <p className="text-white font-medium text-sm truncate">{displayName}</p>
            <div className="flex items-center gap-2">
              {callState === 'connected' && callDuration > 0 && (
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 text-xs">
                  {formatDuration(callDuration)}
                </Badge>
              )}
              <span className="text-xs text-slate-400">{connectionStatus}</span>
              {connectionRoute !== 'unknown' && callState === 'connected' && (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    connectionRoute === 'direct' 
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' 
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                  }`}
                  data-testid="badge-connection-route"
                  title={`ICE: ${iceCandidateType}`}
                >
                  {connectionRoute === 'direct' ? (
                    <><Wifi className="w-3 h-3 mr-1 inline" /> Direct</>
                  ) : (
                    <><Radio className="w-3 h-3 mr-1 inline" /> Relay</>
                  )}
                  <span className="ml-1 opacity-60 text-[10px]">({iceCandidateType})</span>
                </Badge>
              )}
              {callState === 'connected' && isFeatureEnabled('E2E_ENCRYPTION_INDICATOR') && (
                <Badge 
                  variant="outline" 
                  className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                  data-testid="badge-e2e-encrypted"
                >
                  <Lock className="w-3 h-3 mr-1 inline" /> E2E
                </Badge>
              )}
            </div>
          </div>
        </div>

        {callState === 'calling' && (
          <div className="absolute bottom-28 left-0 right-0 flex items-center justify-center pointer-events-none">
            <div className="text-center bg-slate-900/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-2xl">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 animate-pulse">
                <PhoneCall className="w-8 h-8 text-white" />
              </div>
              <p className="text-xl font-semibold text-white mb-1">Calling...</p>
              <p className="text-slate-400 text-sm">{displayName}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-6 safe-area-inset-bottom">
        <div className="flex justify-center items-center gap-3 max-w-md mx-auto">
          <Button
            onClick={toggleMute}
            variant="ghost"
            size="lg"
            className={`w-14 h-14 rounded-full ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
            data-testid="button-mute"
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>

          {isVideoCall ? (
            <>
              <Button
                onClick={toggleVideo}
                variant="ghost"
                size="lg"
                className={`w-14 h-14 rounded-full ${!isVideoEnabled ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                data-testid="button-video"
              >
                {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
              </Button>

              <Button
                onClick={switchCamera}
                variant="ghost"
                size="lg"
                className="w-14 h-14 rounded-full bg-slate-700 text-white hover:bg-slate-600"
                data-testid="button-flip-camera"
              >
                <SwitchCamera className="h-6 w-6" />
              </Button>
            </>
          ) : (
            <Button
              onClick={upgradeToVideo}
              variant="ghost"
              size="lg"
              className="w-14 h-14 rounded-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
              data-testid="button-upgrade-video"
            >
              <Video className="h-6 w-6" />
            </Button>
          )}

          <Button
            onClick={toggleSpeaker}
            variant="ghost"
            size="lg"
            className={`w-14 h-14 rounded-full ${!isSpeakerOn ? 'bg-slate-700 text-slate-400 hover:bg-slate-600' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
            data-testid="button-speaker"
          >
            {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </Button>

          <Button
            onClick={handleEndCall}
            size="lg"
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
            data-testid="button-hangup"
          >
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
      </div>

      {/* Upgrade Modal for Free Users */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-amber-400" />
              Network Requires Relay Mode
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This network blocks direct calling. Upgrade to Pro or Business for Relay Mode, which ensures reliable calls on mobile data and restrictive networks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-sm text-slate-300">
                <strong className="text-emerald-400">Pro ($9/mo)</strong> - Includes Relay Mode for reliable calling anywhere
              </p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-sm text-slate-300">
                <strong className="text-purple-400">Business ($29/mo)</strong> - Priority relay + business features
              </p>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowUpgradeModal(false);
                // Try again with STUN only
                hasAttemptedTurnFallbackRef.current = false;
                attemptReconnect();
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="button-try-again"
            >
              Try Again
            </Button>
            {isVideoCall && (
              <Button
                variant="outline"
                onClick={() => {
                  setShowUpgradeModal(false);
                  setIsVideoCall(false);
                  setIsVideoEnabled(false);
                  toast.info('Switched to audio-only mode');
                  // Restart with audio only
                  cleanupPeerConnection();
                  initiatePeerConnection(isInitiator);
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                data-testid="button-switch-audio"
              >
                <Phone className="w-4 h-4 mr-2" />
                Switch to Audio
              </Button>
            )}
            <Button
              onClick={() => {
                setShowUpgradeModal(false);
                handleEndCall();
                window.location.href = '/';
              }}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              data-testid="button-upgrade"
            >
              <Zap className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connection Handshake Error - shown only after all silent retries fail */}
      <Dialog open={showHandshakeError} onOpenChange={setShowHandshakeError}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <PhoneOff className="w-5 h-5 text-amber-400" />
              Connection Issue
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Connection handshake failed. Tap to retry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowHandshakeError(false);
                handleEndCall();
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="button-cancel-call"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRetryCall}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              data-testid="button-retry-call"
            >
              <PhoneCall className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
