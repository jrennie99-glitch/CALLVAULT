import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { BottomNav, type TabType } from '@/components/BottomNav';
import { TopBar } from '@/components/TopBar';
import { LockScreen } from '@/components/LockScreen';
import { CallView } from '@/components/CallView';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import { CallRequestModal } from '@/components/CallRequestModal';
import { FAB } from '@/components/FAB';
import { ChatsTab } from '@/components/tabs/ChatsTab';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ContactsTab } from '@/components/tabs/ContactsTab';
import { AddTab } from '@/components/tabs/AddTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { CallPermissionsSettings } from '@/components/CallPermissionsSettings';
import { BlocklistManager } from '@/components/BlocklistManager';
import { AIGuardianSettings } from '@/components/AIGuardianSettings';
import { WalletVerification } from '@/components/WalletVerification';
import { InvitePassManager } from '@/components/InvitePassManager';
import { ChatPage } from '@/pages/chat';
import * as cryptoLib from '@/lib/crypto';
import { getAppSettings, addCallRecord, getContactByAddress, getContacts } from '@/lib/storage';
import { getLocalConversations, saveLocalConversation, getOrCreateDirectConvo, saveLocalMessage, incrementUnreadCount, getPrivacySettings } from '@/lib/messageStorage';
import { addToLocalBlocklist } from '@/lib/policyStorage';
import type { CryptoIdentity, WSMessage, Conversation, Message, CallRequest } from '@shared/types';

type SettingsScreen = 'main' | 'call_permissions' | 'blocklist' | 'ai_guardian' | 'wallet' | 'passes';

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
  const [callRequest, setCallRequest] = useState<CallRequest | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAddressRef = useRef<string | null>(null);

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

    fetchTurnConfig();
    initWebSocket(storedIdentity);
    loadConversations();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
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

  const initWebSocket = (storedIdentity: CryptoIdentity) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      websocket.send(JSON.stringify({ type: 'register', address: storedIdentity.address }));
    };

    websocket.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
    };

    websocket.onclose = () => {
      console.log('WebSocket closed');
      setTimeout(() => {
        if (storedIdentity) {
          initWebSocket(storedIdentity);
        }
      }, 3000);
    };

    setWs(websocket);
  };

  const handleWebSocketMessage = useCallback((message: WSMessage) => {
    if (message.type === 'call:incoming') {
      setIncomingCall({
        from_address: message.from_address,
        from_pubkey: message.from_pubkey,
        media: message.media
      });
    }
    
    if (message.type === 'call:blocked') {
      toast.error(message.reason);
    }
    
    if (message.type === 'call:request') {
      setCallRequest(message.request);
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
  }, [activeChat]);

  const handleStartCall = (address: string, video: boolean) => {
    setCallDestination(address);
    setCallIsVideo(video);
    setCallIsInitiator(true);
    setInCall(true);
  };

  const handleAcceptCall = async () => {
    if (!incomingCall || !ws || !identity) return;

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

  const handleCallRequestAccept = () => {
    if (!callRequest || !ws) return;
    ws.send(JSON.stringify({
      type: 'call:request_response',
      request_id: callRequest.id,
      accepted: true
    }));
    setCallRequest(null);
    toast.success('Call request accepted');
  };

  const handleCallRequestDecline = () => {
    if (!callRequest || !ws) return;
    ws.send(JSON.stringify({
      type: 'call:request_response',
      request_id: callRequest.id,
      accepted: false
    }));
    setCallRequest(null);
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
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsTab 
            onStartCall={handleStartCall}
            onNavigateToAdd={() => setActiveTab('add')}
            onShareQR={() => setActiveTab('add')}
            onOpenChat={handleOpenChat}
          />
        )}
        {activeTab === 'add' && (
          <AddTab
            myAddress={identity.address}
            onContactAdded={() => setActiveTab('contacts')}
            onStartCall={handleStartCall}
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

      {callRequest && (
        <CallRequestModal
          request={callRequest}
          onAccept={handleCallRequestAccept}
          onDecline={handleCallRequestDecline}
        />
      )}
    </div>
  );
}
