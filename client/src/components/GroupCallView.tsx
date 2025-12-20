import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Users, Lock, Unlock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { GroupCallRoom, GroupCallParticipant } from '@shared/types';

const formatDuration = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface GroupCallViewProps {
  room: GroupCallRoom;
  participants: GroupCallParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isVideoOff: boolean;
  isHost: boolean;
  onLeave: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLockRoom?: (locked: boolean) => void;
  onInvite?: () => void;
  getContactName?: (address: string) => string;
}

function ParticipantTile({
  participant,
  stream,
  isLocal,
  isMuted,
  isVideoOff,
  getContactName
}: {
  participant: GroupCallParticipant;
  stream: MediaStream | null;
  isLocal: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  getContactName?: (address: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const displayName = participant.display_name || 
    getContactName?.(participant.user_address) || 
    participant.user_address.slice(0, 8);

  const showVideo = stream && !isVideoOff;

  return (
    <div 
      className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center"
      data-testid={`tile-participant-${participant.user_address}`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-2xl bg-gray-700">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-sm">{displayName}</span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">
          {isLocal ? 'You' : displayName}
        </span>
        {participant.is_host && (
          <span className="text-xs bg-primary/80 text-white px-2 py-1 rounded">Host</span>
        )}
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1">
        {isMuted && (
          <div className="bg-red-500 p-1 rounded-full">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
        {isVideoOff && (
          <div className="bg-red-500 p-1 rounded-full">
            <VideoOff className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

export function GroupCallView({
  room,
  participants,
  localStream,
  remoteStreams,
  isMuted,
  isVideoOff,
  isHost,
  onLeave,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onLockRoom,
  onInvite,
  getContactName
}: GroupCallViewProps) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const startTime = room.created_at;
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [room.created_at]);

  const gridCols = participants.length <= 2 ? 'grid-cols-1' :
                   participants.length <= 4 ? 'grid-cols-2' :
                   participants.length <= 6 ? 'grid-cols-2 md:grid-cols-3' :
                   'grid-cols-3 md:grid-cols-4';

  const myParticipant = participants.find(p => p.user_address === room.host_address);

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col z-50" data-testid="group-call-view">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-white" />
          <div>
            <h2 className="text-white font-medium" data-testid="text-room-name">
              {room.name || 'Group Call'}
            </h2>
            <p className="text-gray-400 text-sm" data-testid="text-participant-count">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white font-mono" data-testid="text-call-duration">
            {formatDuration(duration)}
          </span>
          {isHost && room.is_locked && (
            <Lock className="w-4 h-4 text-yellow-400" />
          )}
        </div>
      </div>

      <div className={`flex-1 p-4 overflow-auto grid ${gridCols} gap-4 auto-rows-fr`}>
        {participants.map(participant => {
          const isLocal = participant.user_address === room.host_address && isHost;
          const stream = isLocal ? localStream : remoteStreams.get(participant.user_address) || null;
          
          return (
            <ParticipantTile
              key={participant.user_address}
              participant={participant}
              stream={stream}
              isLocal={isLocal}
              isMuted={isLocal ? isMuted : participant.is_muted}
              isVideoOff={isLocal ? isVideoOff : participant.is_video_off}
              getContactName={getContactName}
            />
          );
        })}
      </div>

      <div className="bg-gray-800/80 px-4 py-4 safe-area-bottom">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className={`rounded-full w-14 h-14 ${isMuted ? 'bg-red-500 border-red-500' : 'bg-gray-700 border-gray-600'}`}
            onClick={onToggleMute}
            data-testid="button-toggle-mute"
          >
            {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </Button>

          {room.is_video && (
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full w-14 h-14 ${isVideoOff ? 'bg-red-500 border-red-500' : 'bg-gray-700 border-gray-600'}`}
              onClick={onToggleVideo}
              data-testid="button-toggle-video"
            >
              {isVideoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
            </Button>
          )}

          {isHost && onInvite && (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-14 h-14 bg-gray-700 border-gray-600"
              onClick={onInvite}
              data-testid="button-invite"
            >
              <UserPlus className="w-6 h-6 text-white" />
            </Button>
          )}

          {isHost && onLockRoom && (
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full w-14 h-14 ${room.is_locked ? 'bg-yellow-600 border-yellow-500' : 'bg-gray-700 border-gray-600'}`}
              onClick={() => onLockRoom(!room.is_locked)}
              data-testid="button-lock-room"
            >
              {room.is_locked ? <Lock className="w-6 h-6 text-white" /> : <Unlock className="w-6 h-6 text-white" />}
            </Button>
          )}

          <Button
            variant="destructive"
            size="icon"
            className="rounded-full w-14 h-14"
            onClick={isHost ? onEnd : onLeave}
            data-testid="button-leave-call"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>

        <p className="text-center text-gray-400 text-xs mt-3">
          {isHost ? 'Tap red button to end call for everyone' : 'Tap red button to leave'}
        </p>
      </div>
    </div>
  );
}
