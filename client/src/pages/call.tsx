import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { BottomNav, type TabType } from '@/components/BottomNav';
import { TopBar } from '@/components/TopBar';
import { LockScreen } from '@/components/LockScreen';
import { CallView } from '@/components/CallView';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import { FAB } from '@/components/FAB';
import { CallsTab } from '@/components/tabs/CallsTab';
import { ContactsTab } from '@/components/tabs/ContactsTab';
import { AddTab } from '@/components/tabs/AddTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import * as cryptoLib from '@/lib/crypto';
import { getAppSettings, addCallRecord, getContactByAddress, getContacts } from '@/lib/storage';
import type { CryptoIdentity, WSMessage } from '@shared/types';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export default function CallPage() {
  const [identity, setIdentity] = useState<CryptoIdentity | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const contacts = getContacts();
    return contacts.length === 0 ? 'contacts' : 'calls';
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
  }, []);

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

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <TopBar />

      <main className="flex-1 pb-20 overflow-y-auto">
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
          />
        )}
        {activeTab === 'add' && (
          <AddTab
            myAddress={identity.address}
            onContactAdded={() => setActiveTab('contacts')}
            onStartCall={handleStartCall}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            identity={identity}
            onRotateAddress={handleRotateAddress}
            turnEnabled={turnEnabled}
          />
        )}
      </main>

      {(activeTab === 'calls' || activeTab === 'contacts') && (
        <FAB 
          onNavigate={setActiveTab}
          onAction={(action) => {
            if (action === 'share-qr') {
              setActiveTab('add');
            }
          }}
        />
      )}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {incomingCall && (
        <IncomingCallModal
          fromAddress={incomingCall.from_address}
          isVideo={incomingCall.media.video}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}
    </div>
  );
}
