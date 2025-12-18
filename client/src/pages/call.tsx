import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Copy, RefreshCw, Phone } from "lucide-react";
import * as crypto from "@/lib/crypto";
import type { CryptoIdentity, WSMessage } from "@shared/types";

type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export default function CallPage() {
  const [identity, setIdentity] = useState<CryptoIdentity | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [incomingCall, setIncomingCall] = useState<{ from_address: string; from_pubkey: string; media: { audio: boolean; video: boolean } } | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAddressRef = useRef<string | null>(null);

  useEffect(() => {
    let storedIdentity = crypto.loadIdentity();
    if (!storedIdentity) {
      storedIdentity = crypto.generateIdentity();
      crypto.saveIdentity(storedIdentity);
    }
    setIdentity(storedIdentity);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      if (storedIdentity) {
        websocket.send(JSON.stringify({ type: 'register', address: storedIdentity.address }));
      }
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
      toast.error('Disconnected from server');
    };

    setWs(websocket);

    return () => {
      websocket.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  const handleWebSocketMessage = useCallback(async (message: WSMessage) => {
    switch (message.type) {
      case 'call:incoming':
        setIncomingCall({
          from_address: message.from_address,
          from_pubkey: message.from_pubkey,
          media: message.media
        });
        break;

      case 'call:accept':
        setCallState('connected');
        await initiatePeerConnection(true);
        break;

      case 'call:reject':
        toast.error('Call rejected');
        setCallState('idle');
        cleanupCall();
        break;

      case 'call:end':
        toast('Call ended');
        setCallState('idle');
        cleanupCall();
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
        toast.error(message.message);
        setCallState('idle');
        break;

      case 'success':
        console.log(message.message);
        break;
    }
  }, []);

  const initiatePeerConnection = async (isInitiator: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
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

  const makeCall = () => {
    if (!identity || !ws || !destinationAddress) {
      toast.error('Missing required information');
      return;
    }

    const intent = {
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      to_address: destinationAddress,
      timestamp: Date.now(),
      nonce: crypto.generateNonce(),
      media: {
        audio: true,
        video: isVideoCall
      }
    };

    const signedIntent = crypto.signCallIntent(intent, identity.secretKey);
    remoteAddressRef.current = destinationAddress;
    
    ws.send(JSON.stringify({
      type: 'call:init',
      data: signedIntent
    }));

    setCallState('calling');
    toast('Calling...');
  };

  const acceptCall = async () => {
    if (!incomingCall || !ws || !identity) return;

    remoteAddressRef.current = incomingCall.from_address;
    setCallState('connected');
    setIncomingCall(null);

    ws.send(JSON.stringify({
      type: 'call:accept',
      to_address: incomingCall.from_address
    }));

    await initiatePeerConnection(false);
  };

  const rejectCall = () => {
    if (!incomingCall || !ws) return;

    ws.send(JSON.stringify({
      type: 'call:reject',
      to_address: incomingCall.from_address
    }));

    setIncomingCall(null);
  };

  const endCall = () => {
    if (ws && remoteAddressRef.current) {
      ws.send(JSON.stringify({
        type: 'call:end',
        to_address: remoteAddressRef.current
      }));
    }
    cleanupCall();
    setCallState('idle');
  };

  const cleanupCall = () => {
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
    remoteAddressRef.current = null;
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

  const copyAddress = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.address);
      toast.success('Address copied to clipboard');
    }
  };

  const rotateAddress = () => {
    if (identity) {
      const updated = crypto.rotateAddress(identity);
      setIdentity(updated);
      if (ws) {
        ws.send(JSON.stringify({ type: 'register', address: updated.address }));
      }
      toast.success('New address generated');
    }
  };

  if (!identity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-white">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Crypto Call
          </h1>
          <p className="text-gray-400">Secure peer-to-peer video calls with crypto addresses</p>
        </div>

        {callState === 'idle' && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Your Identity</CardTitle>
                <CardDescription className="text-gray-400">Your unique call address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-gray-300">Public Key</Label>
                  <div className="mt-1 p-3 bg-gray-900/50 rounded-md font-mono text-sm text-gray-300 break-all">
                    {identity.publicKeyBase58}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300">Call Address</Label>
                  <div className="mt-1 p-3 bg-gray-900/50 rounded-md font-mono text-sm text-blue-400 break-all" data-testid="text-address">
                    {identity.address}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyAddress} variant="outline" className="flex-1" data-testid="button-copy-address">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Address
                  </Button>
                  <Button onClick={rotateAddress} variant="outline" data-testid="button-rotate-address">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Make a Call</CardTitle>
                <CardDescription className="text-gray-400">Paste a call address to connect</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="destination" className="text-gray-300">Destination Address</Label>
                  <Input
                    id="destination"
                    placeholder="call:..."
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="mt-1 bg-gray-900/50 border-gray-600 text-white"
                    data-testid="input-destination"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-gray-300">Call Type:</Label>
                  <Badge variant={isVideoCall ? "default" : "secondary"} onClick={() => setIsVideoCall(!isVideoCall)} className="cursor-pointer" data-testid="badge-call-type">
                    {isVideoCall ? 'Video Call' : 'Audio Only'}
                  </Badge>
                </div>
                <Button 
                  onClick={makeCall} 
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  disabled={!destinationAddress}
                  data-testid="button-call"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Call
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {(callState === 'calling' || callState === 'connected') && (
          <Card className="bg-gray-800/50 border-gray-700 backdrop-blur">
            <CardContent className="p-0">
              <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
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
                  className="absolute bottom-4 right-4 w-48 h-36 object-cover rounded-lg border-2 border-gray-600 shadow-lg"
                  data-testid="video-local"
                />
                {callState === 'calling' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center">
                      <div className="text-2xl font-semibold mb-2">Calling...</div>
                      <div className="text-gray-400">Waiting for answer</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 flex justify-center gap-4">
                <Button
                  onClick={toggleMute}
                  variant={isMuted ? "destructive" : "outline"}
                  size="lg"
                  className="rounded-full"
                  data-testid="button-mute"
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                {isVideoCall && (
                  <Button
                    onClick={toggleVideo}
                    variant={!isVideoEnabled ? "destructive" : "outline"}
                    size="lg"
                    className="rounded-full"
                    data-testid="button-video"
                  >
                    {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  onClick={endCall}
                  variant="destructive"
                  size="lg"
                  className="rounded-full"
                  data-testid="button-hangup"
                >
                  <PhoneOff className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!incomingCall} onOpenChange={(open) => !open && rejectCall()}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Incoming Call</DialogTitle>
            <DialogDescription className="text-gray-400">
              {incomingCall?.media.video ? 'Video call' : 'Audio call'} from:
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-gray-900/50 rounded-md font-mono text-sm text-blue-400 break-all" data-testid="text-incoming-address">
            {incomingCall?.from_address}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button onClick={rejectCall} variant="outline" data-testid="button-reject">
              Reject
            </Button>
            <Button onClick={acceptCall} className="bg-gradient-to-r from-green-500 to-emerald-600" data-testid="button-accept">
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
