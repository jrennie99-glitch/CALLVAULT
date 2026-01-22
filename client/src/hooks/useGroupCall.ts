import { useState, useCallback, useRef, useEffect } from 'react';
import type { GroupCallRoom, GroupCallParticipant, WSMessage } from '@shared/types';
import { generateUUID } from '@/lib/uuid';

interface PeerConnection {
  peerAddress: string;
  connection: RTCPeerConnection;
  remoteStream: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useGroupCall(ws: WebSocket | null, myAddress: string) {
  const [room, setRoom] = useState<GroupCallRoom | null>(null);
  const [participants, setParticipants] = useState<GroupCallParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ room_id: string; from_address: string; is_video: boolean } | null>(null);

  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomRef = useRef<GroupCallRoom | null>(null);

  // Keep roomRef in sync
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const createPeerConnection = useCallback((peerAddress: string, roomId: string, isInitiator: boolean) => {
    if (!ws) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({
          type: 'mesh:ice',
          room_id: roomId,
          to_peer: peerAddress,
          from_peer: myAddress,
          candidate: event.candidate.toJSON()
        } as WSMessage));
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(peerAddress, stream);
          return newMap;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerAddress}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log(`Peer ${peerAddress} connection failed/disconnected`);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnections.current.set(peerAddress, {
      peerAddress,
      connection: pc,
      remoteStream: null
    });

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) {
            ws.send(JSON.stringify({
              type: 'mesh:offer',
              room_id: roomId,
              to_peer: peerAddress,
              from_peer: myAddress,
              offer: pc.localDescription
            } as WSMessage));
          }
        })
        .catch(console.error);
    }

    return pc;
  }, [ws, myAddress]);

  const handleMeshOffer = useCallback(async (message: any) => {
    const { from_peer, offer, room_id } = message;
    
    let peerData = peerConnections.current.get(from_peer);
    if (!peerData) {
      const pc = createPeerConnection(from_peer, room_id, false);
      if (!pc) return;
      peerData = peerConnections.current.get(from_peer);
    }

    if (!peerData) return;
    const pc = peerData.connection;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws?.send(JSON.stringify({
      type: 'mesh:answer',
      room_id: room_id,
      to_peer: from_peer,
      from_peer: myAddress,
      answer: pc.localDescription
    } as WSMessage));
  }, [createPeerConnection, ws, myAddress]);

  const handleMeshAnswer = useCallback(async (message: any) => {
    const { from_peer, answer } = message;
    const peerData = peerConnections.current.get(from_peer);
    if (peerData) {
      await peerData.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleMeshIce = useCallback(async (message: any) => {
    const { from_peer, candidate } = message;
    const peerData = peerConnections.current.get(from_peer);
    if (peerData && candidate) {
      await peerData.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'room:created':
        setRoom(message.room);
        setIsInRoom(true);
        break;

      case 'room:joined':
        setRoom(message.room);
        setParticipants(message.participants);
        setIsInRoom(true);
        message.participants.forEach((p: GroupCallParticipant) => {
          if (p.user_address !== myAddress) {
            createPeerConnection(p.user_address, message.room.id, true);
          }
        });
        break;

      case 'room:invite':
        setPendingInvite({
          room_id: message.room_id,
          from_address: message.from_address,
          is_video: message.is_video
        });
        break;

      case 'room:participant_joined':
        setParticipants(prev => [...prev, message.participant]);
        if (roomRef.current) {
          createPeerConnection(message.participant.user_address, roomRef.current.id, false);
        }
        break;

      case 'room:participant_left':
        setParticipants(prev => prev.filter(p => p.user_address !== message.user_address));
        const peerData = peerConnections.current.get(message.user_address);
        if (peerData) {
          peerData.connection.close();
          peerConnections.current.delete(message.user_address);
        }
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(message.user_address);
          return newMap;
        });
        break;

      case 'room:ended':
        cleanup();
        break;

      case 'room:error':
        setError(message.message);
        break;

      case 'mesh:offer':
        handleMeshOffer(message);
        break;

      case 'mesh:answer':
        handleMeshAnswer(message);
        break;

      case 'mesh:ice':
        handleMeshIce(message);
        break;
    }
  }, [myAddress, createPeerConnection, handleMeshOffer, handleMeshAnswer, handleMeshIce]);

  const cleanup = useCallback(() => {
    peerConnections.current.forEach(peer => {
      peer.connection.close();
    });
    peerConnections.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams(new Map());
    setRoom(null);
    setParticipants([]);
    setIsInRoom(false);
    setPendingInvite(null);
    setError(null);
  }, []);

  const startLocalStream = useCallback(async (video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get media:', err);
      setError('Could not access camera/microphone');
      return null;
    }
  }, []);

  const createRoom = useCallback(async (isVideo: boolean, name?: string, participantAddresses?: string[]) => {
    if (!ws) return;

    const stream = await startLocalStream(isVideo);
    if (!stream) return;

    const timestamp = Date.now();
    const nonce = generateUUID();

    ws.send(JSON.stringify({
      type: 'room:create',
      name,
      is_video: isVideo,
      participant_addresses: participantAddresses || [],
      signature: '',
      from_pubkey: '',
      from_address: myAddress,
      nonce,
      timestamp
    } as WSMessage));
  }, [ws, myAddress, startLocalStream]);

  const joinRoom = useCallback(async (roomId: string) => {
    if (!ws) return;

    const pendingRoom = pendingInvite;
    const isVideo = pendingRoom?.is_video ?? true;

    const stream = await startLocalStream(isVideo);
    if (!stream) return;

    const timestamp = Date.now();
    const nonce = generateUUID();

    ws.send(JSON.stringify({
      type: 'room:join',
      room_id: roomId,
      signature: '',
      from_pubkey: '',
      from_address: myAddress,
      nonce,
      timestamp
    } as WSMessage));

    setPendingInvite(null);
  }, [ws, myAddress, startLocalStream, pendingInvite]);

  const leaveRoom = useCallback(() => {
    if (!ws || !room) return;

    ws.send(JSON.stringify({
      type: 'room:leave',
      room_id: room.id,
      from_address: myAddress
    } as WSMessage));

    cleanup();
  }, [ws, room, myAddress, cleanup]);

  const endRoom = useCallback(() => {
    if (!ws || !room) return;

    ws.send(JSON.stringify({
      type: 'room:end',
      room_id: room.id
    } as WSMessage));

    cleanup();
  }, [ws, room, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, []);

  const declineInvite = useCallback(() => {
    setPendingInvite(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    room,
    participants,
    remoteStreams,
    localStream,
    isInRoom,
    isMuted,
    isVideoOff,
    error,
    pendingInvite,
    isHost: room?.host_address === myAddress,
    handleMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    toggleMute,
    toggleVideo,
    declineInvite,
    cleanup
  };
}
