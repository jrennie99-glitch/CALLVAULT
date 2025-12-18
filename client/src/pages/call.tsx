import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Copy, 
  RefreshCw, 
  Phone,
  Volume2,
  VolumeX,
  SwitchCamera,
  PhoneCall,
  PhoneIncoming,
  User
} from "lucide-react";
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
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAddressRef = useRef<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, []);

  const startCallTimer = () => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleWebSocketMessage = useCallback(async (message: WSMessage) => {
    switch (message.type) {
      case 'call:incoming':
        setIncomingCall({
          from_address: message.from_address,
          from_pubkey: message.from_pubkey,
          media: message.media
        });
        setIsVideoCall(message.media.video);
        break;

      case 'call:accept':
        setCallState('connected');
        setConnectionStatus('Connecting...');
        await initiatePeerConnection(true);
        break;

      case 'call:reject':
        toast.error('Call rejected');
        setCallState('idle');
        setConnectionStatus('');
        cleanupCall();
        break;

      case 'call:end':
        toast('Call ended');
        setCallState('idle');
        setConnectionStatus('');
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
        setConnectionStatus('');
        break;

      case 'success':
        console.log(message.message);
        break;
    }
  }, []);

  const initiatePeerConnection = async (isInitiator: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoCall ? { facingMode } : false,
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
        setConnectionStatus('Connected');
        startCallTimer();
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
            setConnectionStatus('Connecting...');
            break;
          case 'connected':
            setConnectionStatus('Connected');
            break;
          case 'disconnected':
            setConnectionStatus('Reconnecting...');
            break;
          case 'failed':
            setConnectionStatus('Connection failed');
            toast.error('Connection failed');
            break;
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
    } catch (error) {
      console.error('Failed to get media devices:', error);
      toast.error('Failed to access camera/microphone');
      setCallState('idle');
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

  const makeCall = (withVideo: boolean) => {
    if (!identity || !ws || !destinationAddress) {
      toast.error('Please enter a destination address');
      return;
    }

    setIsVideoCall(withVideo);
    setIsVideoEnabled(withVideo);

    const intent = {
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      to_address: destinationAddress,
      timestamp: Date.now(),
      nonce: crypto.generateNonce(),
      media: {
        audio: true,
        video: withVideo
      }
    };

    const signedIntent = crypto.signCallIntent(intent, identity.secretKey);
    remoteAddressRef.current = destinationAddress;
    
    ws.send(JSON.stringify({
      type: 'call:init',
      data: signedIntent
    }));

    setCallState('calling');
    setConnectionStatus('Ringing...');
  };

  const acceptCall = async () => {
    if (!incomingCall || !ws || !identity) return;

    remoteAddressRef.current = incomingCall.from_address;
    setCallState('connected');
    setConnectionStatus('Connecting...');
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
    setConnectionStatus('');
  };

  const cleanupCall = () => {
    stopCallTimer();
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
        toast('Speaker switch not supported in this browser');
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
      console.error('Failed to switch audio output:', error);
      toast.error('Failed to switch audio output');
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-white text-xl">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {callState === 'idle' && (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2 pt-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4">
              <Phone className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold">Crypto Call</h1>
            <p className="text-slate-400">Secure peer-to-peer calls</p>
          </div>

          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Your Call Address
              </CardTitle>
              <CardDescription className="text-slate-400">Share this with friends to receive calls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-900/50 rounded-xl font-mono text-sm text-emerald-400 break-all border border-slate-700" data-testid="text-address">
                {identity.address}
              </div>
              <div className="flex gap-2">
                <Button onClick={copyAddress} className="flex-1 bg-emerald-600 hover:bg-emerald-700" data-testid="button-copy-address">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Address
                </Button>
                <Button onClick={rotateAddress} variant="outline" className="border-slate-600 hover:bg-slate-700" data-testid="button-rotate-address">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <PhoneCall className="w-5 h-5" />
                Make a Call
              </CardTitle>
              <CardDescription className="text-slate-400">Enter a call address to connect</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="destination" className="text-slate-300">Destination Address</Label>
                <Input
                  id="destination"
                  placeholder="call:..."
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                  className="mt-2 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500"
                  data-testid="input-destination"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button 
                  onClick={() => makeCall(true)} 
                  className="h-16 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 flex flex-col items-center justify-center gap-1"
                  disabled={!destinationAddress}
                  data-testid="button-video-call"
                >
                  <Video className="h-6 w-6" />
                  <span className="text-sm font-medium">Video Call</span>
                </Button>
                <Button 
                  onClick={() => makeCall(false)} 
                  className="h-16 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 flex flex-col items-center justify-center gap-1"
                  disabled={!destinationAddress}
                  data-testid="button-voice-call"
                >
                  <Phone className="h-6 w-6" />
                  <span className="text-sm font-medium">Voice Call</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-slate-500 text-sm">
            <p>Your private key never leaves your device</p>
          </div>
        </div>
      )}

      {(callState === 'calling' || callState === 'connected') && (
        <div className="h-screen flex flex-col">
          <div className="flex-1 relative bg-slate-900">
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
                  className="absolute top-4 right-4 w-32 h-24 sm:w-48 sm:h-36 object-cover rounded-xl border-2 border-slate-600 shadow-2xl"
                  data-testid="video-local"
                />
              </>
            ) : (
              <>
                <audio ref={remoteVideoRef} autoPlay data-testid="audio-remote" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6">
                      <User className="w-16 h-16 text-white" />
                    </div>
                    <p className="text-slate-400 text-lg">Voice Call</p>
                  </div>
                </div>
              </>
            )}

            <div className="absolute top-4 left-4 right-20 sm:right-52">
              <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl px-4 py-2 inline-block">
                <div className="flex items-center gap-3">
                  {callState === 'connected' && callDuration > 0 && (
                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                      {formatDuration(callDuration)}
                    </Badge>
                  )}
                  <span className="text-sm text-slate-300">{connectionStatus}</span>
                </div>
              </div>
            </div>

            {callState === 'calling' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 animate-pulse">
                    <PhoneCall className="w-12 h-12 text-white" />
                  </div>
                  <p className="text-2xl font-semibold mb-2">Calling...</p>
                  <p className="text-slate-400">Waiting for answer</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-6 safe-area-inset-bottom">
            <div className="flex justify-center items-center gap-4 max-w-md mx-auto">
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
                onClick={endCall}
                size="lg"
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
                data-testid="button-hangup"
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!incomingCall} onOpenChange={(open) => !open && rejectCall()}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm">
          <DialogHeader className="text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 animate-pulse">
              <PhoneIncoming className="w-10 h-10 text-white" />
            </div>
            <DialogTitle className="text-xl">Incoming Call</DialogTitle>
            <DialogDescription className="text-slate-400">
              {incomingCall?.media.video ? 'Video call' : 'Voice call'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-slate-900/50 rounded-xl font-mono text-xs text-emerald-400 break-all text-center" data-testid="text-incoming-address">
            {incomingCall?.from_address}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-3 mt-4">
            <Button 
              onClick={rejectCall} 
              className="h-14 bg-red-500 hover:bg-red-600 rounded-full"
              data-testid="button-reject"
            >
              <PhoneOff className="mr-2 h-5 w-5" />
              Decline
            </Button>
            <Button 
              onClick={acceptCall} 
              className="h-14 bg-emerald-500 hover:bg-emerald-600 rounded-full"
              data-testid="button-accept"
            >
              <Phone className="mr-2 h-5 w-5" />
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
