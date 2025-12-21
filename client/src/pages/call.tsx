import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { BottomNav, type TabType } from '@/components/BottomNav';
import { TopBar } from '@/components/TopBar';
import { LockScreen } from '@/components/LockScreen';
import { CallView } from '@/components/CallView';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import { FAB } from '@/components/FAB';
import { ChatsTab } from '@/components/tabs/ChatsTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ContactsTab } from '@/components/tabs/ContactsTab';
import { VoicemailTab } from '@/components/tabs/VoicemailTab';
import { AddTab } from '@/components/tabs/AddTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { CallPermissionsSettings } from '@/components/CallPermissionsSettings';
import { BlocklistManager } from '@/components/BlocklistManager';
import { AIGuardianSettings } from '@/components/AIGuardianSettings';
import { WalletVerification } from '@/components/WalletVerification';
import { InvitePassManager } from '@/components/InvitePassManager';
import { CreatorModeSettings } from '@/components/CreatorModeSettings';
import { EarningsDashboard } from '@/components/EarningsDashboard';
import { AdminConsole } from '@/components/AdminConsole';
import { ChatPage } from '@/pages/chat';
import * as cryptoLib from '@/lib/crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getAppSettings, addCallRecord, getContactByAddress, getContacts, syncAllContactsToServer } from '@/lib/storage';
import { getLocalConversations, saveLocalConversation, getOrCreateDirectConvo, saveLocalMessage, incrementUnreadCount, getPrivacySettings } from '@/lib/messageStorage';
import { addToLocalBlocklist, isCreatorAvailable, shouldRequirePayment, getCallPricingSettings } from '@/lib/policyStorage';
import { PaymentRequiredScreen } from '@/components/PaymentRequiredScreen';
import { initAudio } from '@/lib/audio';
import type { CryptoIdentity, WSMessage, Conversation, Message, CallRequest, CallPricing } from '@shared/types';

type SettingsScreen = 'main' | 'call_permissions' | 'blocklist' | 'ai_guardian' | 'wallet' | 'passes' | 'creator_mode' | 'earnings_dashboard' | 'admin_console' | 'voicemail';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export default function CallPage() {
  const [identity, setIdentity] = useState<CryptoIdentity | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const contacts = getContacts();
    return contacts.length === 0 ? 'contacts' : 'chats';
  });
  const [showQRModal, setShowQRModal] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callDestination, setCallDestination] = useState('');
  const [callIsVideo, setCallIsVideo] = useState(true);
  const [callIsInitiator, setCallIsInitiator] = useState(true);
  const [incomingCall, setIncomingCall] = useState<{
    from_address: string;
    from_pubkey: string;
    media: { audio: boolean; video: boolean };
  } | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const [turnEnabled, setTurnEnabled] = useState(false);
  const [, forceUpdate] = useState({});
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>('main');
  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);
  const [pendingPaidCall, setPendingPaidCall] = useState<{
    address: string;
    video: boolean;
    pricing: CallPricing;
  } | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAddressRef = useRef<string | null>(null);
  const pendingCallRef = useRef<{ address: string; video: boolean } | null>(null);

  useEffect(() => {
    const settings = getAppSettings();
    if (settings.biometricLockEnabled) {
      setIsLocked(true);
    }

    let storedIdentity = cryptoLib.loadIdentity();
    if (!storedIdentity) {
      storedIdentity = cryptoLib.generateIdentity();
      cryptoLib.saveIdentity(storedIdentity);
    }
    setIdentity(storedIdentity);
    
    // Register identity with server (enables founder detection, plan tracking, etc.)
    registerIdentityWithServer(storedIdentity);
    
    // Sync existing contacts to server for mutual contact verification
    syncAllContactsToServer(storedIdentity.address);

    fetchTurnConfig();
    initWebSocket(storedIdentity);
    loadConversations();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          // Subscribe to push notifications if supported
          setupPushNotifications(registration, storedIdentity.address);
        })
        .catch(console.error);
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  const loadConversations = () => {
    const convos = getLocalConversations();
    setConversations(convos);
    const total = convos.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    setUnreadCount(total);
  };

  // Register identity with server for founder detection, plan tracking, etc.
  const registerIdentityWithServer = async (identity: CryptoIdentity) => {
    try {
      const response = await fetch('/api/identity/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: identity.address,
          publicKeyBase58: identity.publicKeyBase58,
          displayName: null
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Identity registered:', data.role);
        // If user was promoted to founder/admin, we could update local state here
        if (data.role === 'founder' || data.role === 'admin') {
          toast.success(`Welcome back! You have ${data.role} privileges.`);
        }
      }
    } catch (error) {
      console.error('Failed to register identity:', error);
    }
  };

  // Setup push notifications for offline call alerts
  const setupPushNotifications = async (registration: ServiceWorkerRegistration, userAddress: string) => {
    try {
      // Check if push is supported
      if (!('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
      }

      // Request notification permission if not granted
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return;
      }

      // Get VAPID public key from server
      const vapidResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidResponse.ok) {
        console.log('Push notifications not configured on server');
        return;
      }
      const { vapidPublicKey } = await vapidResponse.json();

      // Convert VAPID key to Uint8Array
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      // If no subscription or it's expired, create a new one
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      }

      // Send subscription to server
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          subscription: subscription.toJSON()
        })
      });

      console.log('Push notification subscription active');
    } catch (error) {
      console.error('Failed to setup push notifications:', error);
    }
  };

  const fetchTurnConfig = async () => {
    try {
      const response = await fetch('/api/turn-config');
      if (response.ok) {
        const config = await response.json();
        if (config.turnUrl) {
          const turnServer: RTCIceServer = {
            urls: config.turnUrl,
            username: config.turnUser,
            credential: config.turnPass
          };
          setIceServers([...DEFAULT_ICE_SERVERS, turnServer]);
          setTurnEnabled(true);
        }
      }
    } catch (error) {
      console.log('TURN config not available, using STUN only');
    }
  };

  const wsReconnectAttempt = useRef(0);
  const wsReconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const wsHeartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const wsLastPong = useRef<number>(Date.now());
  const [wsConnected, setWsConnected] = useState(false);
  
  // Heartbeat interval: send ping every 15 seconds, expect response within 10s
  const WS_HEARTBEAT_INTERVAL = 15000;
  const WS_HEARTBEAT_TIMEOUT = 10000;
  
  const initWebSocket = (storedIdentity: CryptoIdentity) => {
    // Clear any pending reconnect and heartbeat
    if (wsReconnectTimeout.current) {
      clearTimeout(wsReconnectTimeout.current);
      wsReconnectTimeout.current = null;
    }
    if (wsHeartbeatInterval.current) {
      clearInterval(wsHeartbeatInterval.current);
      wsHeartbeatInterval.current = null;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      wsReconnectAttempt.current = 0;
      wsLastPong.current = Date.now();
      websocket.send(JSON.stringify({ type: 'register', address: storedIdentity.address }));
      
      // Start client-side heartbeat to detect dead connections fast
      wsHeartbeatInterval.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          // Check if we haven't received a pong in too long
          if (Date.now() - wsLastPong.current > WS_HEARTBEAT_INTERVAL + WS_HEARTBEAT_TIMEOUT) {
            console.log('WebSocket heartbeat timeout, reconnecting...');
            websocket.close();
            return;
          }
          // Send ping (server will respond with pong automatically via WebSocket protocol)
          try {
            websocket.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            console.log('WebSocket send failed, reconnecting...');
            websocket.close();
          }
        }
      }, WS_HEARTBEAT_INTERVAL);
    };

    websocket.onmessage = (event) => {
      // Any message received counts as "alive"
      wsLastPong.current = Date.now();
      
      const message: WSMessage = JSON.parse(event.data);
      
      // Handle pong silently
      if (message.type === 'pong') {
        return;
      }
      
      handleWebSocketMessage(message);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    websocket.onclose = () => {
      console.log('WebSocket closed');
      setWsConnected(false);
      
      // Clear heartbeat
      if (wsHeartbeatInterval.current) {
        clearInterval(wsHeartbeatInterval.current);
        wsHeartbeatInterval.current = null;
      }
      
      // Fast reconnect: 100ms, 200ms, 500ms, 1s, 2s, max 5s
      const delay = Math.min(100 * Math.pow(2, wsReconnectAttempt.current), 5000);
      wsReconnectAttempt.current++;
      
      // Only show toast after multiple quick attempts
      if (wsReconnectAttempt.current > 3) {
        toast.info('Reconnecting...', { duration: 1500 });
      }
      
      wsReconnectTimeout.current = setTimeout(() => {
        if (storedIdentity) {
          initWebSocket(storedIdentity);
        }
      }, delay);
    };

    setWs(websocket);
    
    return websocket;
  };
  
  // Reconnect on visibility change (when app comes back to foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && identity && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log('App visible, reconnecting WebSocket...');
        wsReconnectAttempt.current = 0; // Reset for immediate connection
        initWebSocket(identity);
      }
    };
    
    const handleOnline = () => {
      if (identity && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log('Network online, reconnecting WebSocket...');
        wsReconnectAttempt.current = 0;
        initWebSocket(identity);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      // Clear pending reconnect timeout and heartbeat on unmount
      if (wsReconnectTimeout.current) {
        clearTimeout(wsReconnectTimeout.current);
        wsReconnectTimeout.current = null;
      }
      if (wsHeartbeatInterval.current) {
        clearInterval(wsHeartbeatInterval.current);
        wsHeartbeatInterval.current = null;
      }
    };
  }, [identity, ws]);

  const handleWebSocketMessage = useCallback((message: WSMessage) => {
    if (message.type === 'call:incoming') {
      // Try to initialize audio for ringtone (may need user interaction first)
      initAudio();
      
      setIncomingCall({
        from_address: message.from_address,
        from_pubkey: message.from_pubkey,
        media: message.media
      });
    }
    
    if (message.type === 'call:blocked') {
      toast.error(message.reason);
      pendingCallRef.current = null;
      setInCall(false);
      setCallDestination('');
    }
    
    if (message.type === 'call:request') {
      setCallRequests(prev => [...prev.filter(r => r.id !== message.request.id), message.request]);
      toast.info('Someone wants to call you');
    }
    
    if (message.type === 'msg:incoming') {
      const msg = message.message;
      saveLocalMessage(msg);
      
      if (!activeChat || activeChat.id !== msg.convo_id) {
        incrementUnreadCount(msg.convo_id);
        setUnreadCount(prev => prev + 1);
        
        if ('Notification' in window && Notification.permission === 'granted') {
          const contact = getContactByAddress(msg.from_address);
          new Notification(contact?.name || 'New Message', {
            body: msg.type === 'text' ? msg.content : `Sent ${msg.type}`,
            icon: '/icon-192.png'
          });
        }
        toast.info('New message received');
      }
      
      loadConversations();
    }
    
    if (message.type === 'convo:create' || message.type === 'convo:update') {
      saveLocalConversation(message.convo);
      loadConversations();
    }
    
    if (message.type === 'group:created') {
      saveLocalConversation(message.convo);
      loadConversations();
      toast.success(`Group "${message.convo.name}" created`);
    }
    
    if (message.type === 'group:member_left') {
      loadConversations();
    }
    
    if ((message as any).type === 'pass:used') {
      const passMsg = message as any;
      toast.info('Your Call Invite was used', {
        description: passMsg.pass_type === 'one_time' 
          ? 'This invite is now expired' 
          : `${passMsg.uses_remaining || 0} uses remaining`
      });
    }
    
    // Handle contact:added_by notification - someone added your call ID
    if ((message as any).type === 'contact:added_by') {
      const data = (message as any).data;
      toast.success(`${data.name || 'Someone'} added you as a contact`, {
        description: 'You can now call each other',
        duration: 5000
      });
    }
  }, [activeChat]);

  const handleStartCall = (address: string, video: boolean) => {
    // Initialize audio context on user gesture (required for browser autoplay policy)
    initAudio();
    
    // Guard: Prevent duplicate calls
    if (inCall) {
      toast.error('Already in a call');
      return;
    }
    if (!address || !address.startsWith('call:')) {
      toast.error('Invalid call address');
      return;
    }
    
    // Note: For outbound calls, payment/availability enforcement happens on the recipient's end
    // The recipient's signaling server will reject or queue the call based on their settings
    
    // Proceed with call initiation
    setCallDestination(address);
    setCallIsVideo(video);
    setCallIsInitiator(true);
    setInCall(true);
    pendingCallRef.current = { address, video };
  };
  
  const handlePayAndCall = (token?: string) => {
    if (!pendingPaidCall) return;
    
    // Payment was handled by PaymentRequiredScreen (either test mode or real Stripe)
    // If token is provided, mark it as used
    if (token) {
      fetch('/api/checkout/use-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(console.error);
    }
    
    setCallDestination(pendingPaidCall.address);
    setCallIsVideo(pendingPaidCall.video);
    setCallIsInitiator(true);
    setInCall(true);
    pendingCallRef.current = { address: pendingPaidCall.address, video: pendingPaidCall.video };
    setPendingPaidCall(null);
  };
  
  const handleCancelPaidCall = () => {
    setPendingPaidCall(null);
  };

  const handleAcceptCall = async () => {
    // Initialize audio context on user gesture (required for browser autoplay policy)
    initAudio();
    
    if (!incomingCall || !ws || !identity) return;
    
    // Guard: Prevent accepting if already in a call
    if (inCall) {
      toast.error('Already in a call');
      setIncomingCall(null);
      return;
    }
    
    // Check if I (the creator) require payment from this caller
    const paymentCheck = shouldRequirePayment(incomingCall.from_address);
    if (paymentCheck.required && paymentCheck.pricing) {
      // Reject the call and notify caller that payment is required
      ws.send(JSON.stringify({
        type: 'call:reject',
        to_address: incomingCall.from_address,
        reason: 'payment_required'
      }));
      toast.info('Call rejected - payment required. Share a paid call link with the caller.');
      setIncomingCall(null);
      return;
    }
    
    // Check if I'm available during business hours
    const availability = isCreatorAvailable();
    if (!availability.available) {
      // Reject the call and notify caller of unavailability
      ws.send(JSON.stringify({
        type: 'call:reject',
        to_address: incomingCall.from_address,
        reason: 'unavailable'
      }));
      toast.info(availability.reason || 'Call rejected - outside business hours.');
      setIncomingCall(null);
      return;
    }

    remoteAddressRef.current = incomingCall.from_address;
    setCallDestination(incomingCall.from_address);
    setCallIsVideo(incomingCall.media.video);
    setCallIsInitiator(false);
    setInCall(true);
    setIncomingCall(null);

    ws.send(JSON.stringify({
      type: 'call:accept',
      to_address: incomingCall.from_address
    }));

    const contact = getContactByAddress(incomingCall.from_address);
    addCallRecord({
      address: incomingCall.from_address,
      contactId: contact?.id,
      contactName: contact?.name,
      type: 'incoming',
      mediaType: incomingCall.media.video ? 'video' : 'audio',
      timestamp: Date.now()
    });
  };

  const handleRejectCall = () => {
    if (!incomingCall || !ws) return;

    ws.send(JSON.stringify({
      type: 'call:reject',
      to_address: incomingCall.from_address
    }));

    const contact = getContactByAddress(incomingCall.from_address);
    addCallRecord({
      address: incomingCall.from_address,
      contactId: contact?.id,
      contactName: contact?.name,
      type: 'missed',
      mediaType: incomingCall.media.video ? 'video' : 'audio',
      timestamp: Date.now()
    });

    setIncomingCall(null);
  };

  const handleCallEnd = () => {
    setInCall(false);
    setCallDestination('');
    setCallIsInitiator(true);
    forceUpdate({});
  };

  const handleRotateAddress = () => {
    if (identity) {
      const updated = cryptoLib.rotateAddress(identity);
      setIdentity(updated);
      if (ws) {
        ws.send(JSON.stringify({ type: 'register', address: updated.address }));
      }
      toast.success('New address generated');
    }
  };

  const handleOpenChat = (contactAddress: string) => {
    if (!identity) return;
    const convo = getOrCreateDirectConvo(identity.address, contactAddress);
    saveLocalConversation(convo);
    loadConversations();
    setActiveChat(convo);
  };

  const handleSelectChat = (convo: Conversation) => {
    setActiveChat(convo);
  };

  const handleCloseChat = () => {
    setActiveChat(null);
    loadConversations();
  };

  const handleCreateGroup = async (name: string, participants: string[]) => {
    if (!identity || !ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }
    
    const nonce = cryptoLib.generateNonce();
    const timestamp = Date.now();
    const data = { name, participant_addresses: participants };
    const payload = { ...data, from_address: identity.address, nonce, timestamp };
    const signature = cryptoLib.signPayload(identity.secretKey, payload);
    
    ws.send(JSON.stringify({
      type: 'group:create',
      data,
      signature,
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      nonce,
      timestamp
    }));
    
    setShowCreateGroup(false);
  };

  const handleSettingsNavigate = (screen: SettingsScreen) => {
    setSettingsScreen(screen);
  };

  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

  if (!identity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-white text-xl">Initializing...</div>
      </div>
    );
  }

  if (inCall) {
    return (
      <CallView
        identity={identity}
        ws={ws}
        destinationAddress={callDestination}
        isVideoCall={callIsVideo}
        isInitiator={callIsInitiator}
        onCallEnd={handleCallEnd}
        iceServers={iceServers}
      />
    );
  }

  if (activeChat) {
    return (
      <ChatPage
        identity={identity}
        ws={ws}
        convo={activeChat}
        onBack={handleCloseChat}
        onStartCall={handleStartCall}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <TopBar />
      
      {pendingPaidCall && identity && (
        <PaymentRequiredScreen
          recipientAddress={pendingPaidCall.address}
          recipientName={getContactByAddress(pendingPaidCall.address)?.name}
          pricing={pendingPaidCall.pricing}
          isVideo={pendingPaidCall.video}
          isTestMode={true}
          callerAddress={identity.address}
          signMessage={(message: string) => {
            const messageBytes = new TextEncoder().encode(message);
            const signature = nacl.sign.detached(messageBytes, identity.secretKey);
            return bs58.encode(signature);
          }}
          onPay={handlePayAndCall}
          onCancel={handleCancelPaidCall}
        />
      )}

      <main className="flex-1 pb-20 overflow-y-auto">
        {activeTab === 'chats' && (
          <ChatsTab
            myAddress={identity.address}
            conversations={conversations}
            onSelectChat={handleSelectChat}
            onCreateGroup={() => setShowCreateGroup(true)}
          />
        )}
        {activeTab === 'calls' && (
          <CallsTab 
            onStartCall={handleStartCall}
            onNavigateToAdd={() => setActiveTab('add')}
            onNavigateToContacts={() => setActiveTab('contacts')}
            onNavigateToSettings={() => {
              setActiveTab('settings');
              setSettingsScreen('passes');
            }}
            onNavigateToVoicemail={() => {
              setActiveTab('settings');
              setSettingsScreen('voicemail');
            }}
            myAddress={identity.address}
            onOpenChat={(address) => {
              const convo = getOrCreateDirectConvo(identity.address, address);
              saveLocalConversation(convo);
              loadConversations();
              setActiveChat(convo);
            }}
            callRequests={callRequests}
            onAcceptRequest={(request) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'call:request_response',
                  request_id: request.id,
                  accepted: true
                }));
                setCallRequests(prev => prev.filter(r => r.id !== request.id));
                toast.success('Call request accepted');
              } else {
                toast.error('Not connected');
              }
            }}
            onDeclineRequest={(request) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'call:request_response',
                  request_id: request.id,
                  accepted: false
                }));
              }
              setCallRequests(prev => prev.filter(r => r.id !== request.id));
            }}
            onBlockRequester={(address) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                const nonce = cryptoLib.generateNonce();
                const timestamp = Date.now();
                const payload = { blocked_address: address, from_address: identity.address, nonce, timestamp };
                const signature = cryptoLib.signPayload(identity.secretKey, payload);
                
                ws.send(JSON.stringify({
                  type: 'block:add',
                  blocked_address: address,
                  signature,
                  from_pubkey: identity.publicKeyBase58,
                  from_address: identity.address,
                  nonce,
                  timestamp
                }));
              }
              addToLocalBlocklist({
                owner_address: identity.address,
                blocked_address: address,
                reason: 'Blocked from call request',
                blocked_at: Date.now()
              });
              setCallRequests(prev => prev.filter(r => r.from_address !== address));
              toast.success('User blocked');
            }}
            callQueue={[]}
            onAcceptQueueEntry={(entry) => {
              handleStartCall(entry.caller_address, entry.is_video);
            }}
            onSkipQueueEntry={(entry) => {
              toast.success('Caller skipped');
            }}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsTab 
            onStartCall={handleStartCall}
            onNavigateToAdd={() => setActiveTab('add')}
            onShareQR={() => setActiveTab('add')}
            onOpenChat={handleOpenChat}
            ownerAddress={identity.address}
          />
        )}
        {activeTab === 'add' && (
          <AddTab
            myAddress={identity.address}
            onContactAdded={() => setActiveTab('contacts')}
            onStartCall={handleStartCall}
            onNavigateToInvites={() => {
              setActiveTab('settings');
              setSettingsScreen('passes');
            }}
            onNavigateToPaidLinks={() => {
              setActiveTab('settings');
              setSettingsScreen('creator_mode');
            }}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'main' && (
          <SettingsTab
            identity={identity}
            onRotateAddress={handleRotateAddress}
            turnEnabled={turnEnabled}
            ws={ws}
            onNavigate={handleSettingsNavigate}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'call_permissions' && (
          <CallPermissionsSettings
            identity={identity}
            ws={ws}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'passes' && (
          <div className="p-4">
            <InvitePassManager
              identity={identity}
              ws={ws}
              onBack={() => setSettingsScreen('main')}
            />
          </div>
        )}
        {activeTab === 'settings' && settingsScreen === 'blocklist' && (
          <BlocklistManager
            identity={identity}
            ws={ws}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'ai_guardian' && (
          <AIGuardianSettings
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'wallet' && (
          <WalletVerification
            identity={identity}
            ws={ws}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'creator_mode' && (
          <CreatorModeSettings
            identity={identity}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'earnings_dashboard' && identity && (
          <EarningsDashboard
            creatorAddress={identity.address}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'admin_console' && identity && (
          <AdminConsole
            identity={identity}
            onBack={() => setSettingsScreen('main')}
          />
        )}
        {activeTab === 'settings' && settingsScreen === 'voicemail' && identity && (
          <VoicemailTab
            myAddress={identity.address}
            onClose={() => setSettingsScreen('main')}
          />
        )}
      </main>

      {(activeTab === 'calls' || activeTab === 'contacts' || activeTab === 'chats') && (
        <FAB 
          onNavigate={setActiveTab}
          onAction={(action) => {
            if (action === 'share-qr') {
              setActiveTab('add');
            }
          }}
        />
      )}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} unreadCount={unreadCount} />

      {incomingCall && (
        <IncomingCallModal
          fromAddress={incomingCall.from_address}
          isVideo={incomingCall.media.video}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}
