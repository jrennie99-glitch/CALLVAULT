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
  Zap
} from 'lucide-react';
import * as crypto from '@/lib/crypto';
import { addCallRecord, getContactByAddress } from '@/lib/storage';
import type { CryptoIdentity, WSMessage } from '@shared/types';

type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
type ConnectionRoute = 'unknown' | 'direct' | 'relay';

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
  
  // Ringback tone for caller (plays while waiting for answer)
  useEffect(() => {
    if (callState === 'calling' || callState === 'ringing') {
      import('@/lib/audio').then(({ playRingback }) => {
        playRingback();
      });
    } else {
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

  useEffect(() => {
    remoteAddressRef.current = destinationAddress;
    if (destinationAddress && ws && isInitiator) {
      initiateCall();
    } else if (!isInitiator) {
      setCallState('connected');
      setConnectionStatus('Connecting...');
      initiatePeerConnection(false);
    }
    return () => {
      cleanupCall();
    };
  }, []);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      const message: WSMessage = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

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
      const res = await fetch('/api/call-session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: identity.address })
      });
      if (!res.ok) {
        console.error('Failed to fetch call session token');
        return null;
      }
      const token = await res.json();
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
          if (localCandidate) {
            const candidateType = localCandidate.candidateType;
            if (candidateType === 'relay') {
              setConnectionRoute('relay');
            } else if (candidateType === 'host' || candidateType === 'srflx' || candidateType === 'prflx') {
              setConnectionRoute('direct');
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
      
      // Update ICE servers to include TURN
      const turnServers = callSession.iceServers;
      setCurrentIceServers(turnServers);
      
      // Must rebuild peer connection to use new ICE servers
      // (ICE servers cannot be changed after RTCPeerConnection is created)
      try {
        // Close old connection but keep media stream
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
        
        // Rebuild with TURN servers
        const stream = localStreamRef.current;
        if (!stream) {
          throw new Error('No media stream available');
        }
        
        const pc = new RTCPeerConnection({ iceServers: turnServers });
        peerConnectionRef.current = pc;
        
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
        
        setupPeerConnectionHandlers(pc, isInitiator);
        
        // Re-initiate the call
        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
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
        setCallState('connected');
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

  // Main call initiation - fetches fresh token then starts call
  const initiateCall = async () => {
    if (!identity || !ws) return;

    // Reset handshake error state on new attempt
    setShowHandshakeError(false);
    setConnectionStatus('Preparing secure session...');

    // Fetch fresh token from server (token generated at call time, not page load)
    // Every call attempt uses a fresh token/nonce
    const tokenData = await fetchCallToken();
    
    if (!tokenData) {
      // Check if we should retry silently with exponential backoff
      if (callRetryCountRef.current < MAX_CALL_RETRIES) {
        const delay = RETRY_DELAYS[callRetryCountRef.current] || 1200;
        callRetryCountRef.current++;
        console.log(`[CallToken] Token fetch failed, retrying (attempt ${callRetryCountRef.current}/${MAX_CALL_RETRIES}) after ${delay}ms...`);
        setConnectionStatus('Reconnecting...');
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

    ws.send(JSON.stringify({
      type: 'call:init',
      data: signedIntent,
      callToken: tokenData.token // Include token for server-side validation
    }));

    setCallState('calling');
    setConnectionStatus('Ringing...');
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
      setConnectionStatus('Reconnecting...');
      
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
      if (pc.iceConnectionState === 'disconnected') {
        setCallState('reconnecting');
        setConnectionStatus('Network interrupted...');
      } else if (pc.iceConnectionState === 'checking') {
        startStunFailureTimer();
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearStunFailureTimer();
      }
    };
  };

  const initiatePeerConnection = async (isInitiator: boolean) => {
    // Fetch call session token to get plan-based permissions
    const session = await fetchCallSessionToken();
    
    // Start with STUN-only for cost efficiency
    // TURN will be added via fallback if needed (for paid users only)
    const initialServers = STUN_ONLY_SERVERS;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoCall ? { facingMode } : false,
        audio: true
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({ iceServers: initialServers });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      setupPeerConnectionHandlers(pc, isInitiator);

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
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

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleSpeaker = async () => {
    const mediaElement = remoteVideoRef.current;
    if (!mediaElement) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (audioOutputs.length === 0) {
        toast('No audio output devices found');
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
                >
                  {connectionRoute === 'direct' ? (
                    <><Wifi className="w-3 h-3 mr-1 inline" /> Direct</>
                  ) : (
                    <><Radio className="w-3 h-3 mr-1 inline" /> Relay</>
                  )}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {callState === 'calling' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 animate-pulse">
                <PhoneCall className="w-12 h-12 text-white" />
              </div>
              <p className="text-2xl font-semibold text-white mb-2">Calling...</p>
              <p className="text-slate-400">{displayName}</p>
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

          {isVideoCall && (
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
