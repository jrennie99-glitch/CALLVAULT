import { useState, useEffect, useRef } from 'react';
import { Voicemail, Play, Pause, Trash2, Bookmark, BookmarkCheck, Check, Clock, FileText, Volume2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { getContactByAddress } from '@/lib/storage';

interface VoicemailMessage {
  id: string;
  recipientAddress: string;
  senderAddress: string;
  senderName?: string;
  audioData: string;
  audioFormat: string;
  durationSeconds: number;
  transcription?: string;
  transcriptionStatus: string;
  isRead: boolean;
  isSaved: boolean;
  createdAt: string;
}

interface VoicemailTabProps {
  myAddress: string;
  onClose: () => void;
}

export function VoicemailTab({ myAddress, onClose }: VoicemailTabProps) {
  const [voicemails, setVoicemails] = useState<VoicemailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchVoicemails();
  }, [myAddress]);

  const fetchVoicemails = async () => {
    try {
      const response = await fetch(`/api/voicemails/${encodeURIComponent(myAddress)}`);
      if (response.ok) {
        const data = await response.json();
        setVoicemails(data);
      }
    } catch (error) {
      console.error('Error fetching voicemails:', error);
      toast.error('Failed to load voicemails');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSenderName = (vm: VoicemailMessage) => {
    const contact = getContactByAddress(vm.senderAddress);
    return contact?.name || vm.senderName || vm.senderAddress.slice(5, 15) + '...';
  };

  const handlePlay = async (vm: VoicemailMessage) => {
    if (playingId === vm.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`data:audio/${vm.audioFormat};base64,${vm.audioData}`);
    audioRef.current = audio;
    
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      toast.error('Failed to play voicemail');
      setPlayingId(null);
    };

    try {
      await audio.play();
      setPlayingId(vm.id);

      if (!vm.isRead) {
        await fetch(`/api/voicemail/${vm.id}/read`, { method: 'PUT' });
        setVoicemails(prev => prev.map(v => v.id === vm.id ? { ...v, isRead: true } : v));
      }
    } catch (error) {
      toast.error('Failed to play voicemail');
    }
  };

  const handleSave = async (vm: VoicemailMessage) => {
    try {
      const response = await fetch(`/api/voicemail/${vm.id}/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSaved: !vm.isSaved })
      });
      if (response.ok) {
        setVoicemails(prev => prev.map(v => v.id === vm.id ? { ...v, isSaved: !v.isSaved } : v));
        toast.success(vm.isSaved ? 'Voicemail unsaved' : 'Voicemail saved');
      }
    } catch (error) {
      toast.error('Failed to update voicemail');
    }
  };

  const handleDelete = async (vm: VoicemailMessage) => {
    try {
      const response = await fetch(`/api/voicemail/${vm.id}`, { method: 'DELETE' });
      if (response.ok) {
        setVoicemails(prev => prev.filter(v => v.id !== vm.id));
        toast.success('Voicemail deleted');
      }
    } catch (error) {
      toast.error('Failed to delete voicemail');
    }
  };

  const unreadCount = voicemails.filter(v => !v.isRead).length;
  const savedVoicemails = voicemails.filter(v => v.isSaved);
  const recentVoicemails = voicemails.filter(v => !v.isSaved);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Voicemail className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Voicemail</h2>
            {unreadCount > 0 && (
              <p className="text-sm text-emerald-400">{unreadCount} new message{unreadCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
          data-testid="button-close-voicemail"
        >
          Done
        </Button>
      </div>

      {voicemails.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Voicemail className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-white font-medium mb-2">No voicemails</h3>
          <p className="text-slate-400 text-sm">When callers leave messages, they'll appear here</p>
        </div>
      ) : (
        <>
          {savedVoicemails.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4" />
                Saved Messages
              </h3>
              <div className="space-y-2">
                {savedVoicemails.map(vm => (
                  <VoicemailCard
                    key={vm.id}
                    voicemail={vm}
                    isPlaying={playingId === vm.id}
                    isExpanded={expandedId === vm.id}
                    senderName={getSenderName(vm)}
                    onPlay={() => handlePlay(vm)}
                    onSave={() => handleSave(vm)}
                    onDelete={() => handleDelete(vm)}
                    onExpand={() => setExpandedId(expandedId === vm.id ? null : vm.id)}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            </div>
          )}

          {recentVoicemails.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                {savedVoicemails.length > 0 ? 'Recent Messages' : 'All Messages'}
              </h3>
              <div className="space-y-2">
                {recentVoicemails.map(vm => (
                  <VoicemailCard
                    key={vm.id}
                    voicemail={vm}
                    isPlaying={playingId === vm.id}
                    isExpanded={expandedId === vm.id}
                    senderName={getSenderName(vm)}
                    onPlay={() => handlePlay(vm)}
                    onSave={() => handleSave(vm)}
                    onDelete={() => handleDelete(vm)}
                    onExpand={() => setExpandedId(expandedId === vm.id ? null : vm.id)}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface VoicemailCardProps {
  voicemail: VoicemailMessage;
  isPlaying: boolean;
  isExpanded: boolean;
  senderName: string;
  onPlay: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExpand: () => void;
  formatDuration: (seconds: number) => string;
}

function VoicemailCard({
  voicemail,
  isPlaying,
  isExpanded,
  senderName,
  onPlay,
  onSave,
  onDelete,
  onExpand,
  formatDuration
}: VoicemailCardProps) {
  return (
    <div
      className={`bg-slate-800/50 border rounded-xl overflow-hidden transition-all ${
        voicemail.isRead ? 'border-slate-700' : 'border-emerald-500/50 bg-emerald-500/5'
      }`}
      data-testid={`voicemail-card-${voicemail.id}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar address={voicemail.senderAddress} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">{senderName}</span>
                {!voicemail.isRead && (
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                )}
              </div>
              <span className="text-xs text-slate-500">
                {formatDistanceToNow(new Date(voicemail.createdAt), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(voicemail.durationSeconds)}</span>
              {voicemail.transcription && (
                <>
                  <FileText className="w-3 h-3 ml-2" />
                  <span>Transcript available</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button
            onClick={onPlay}
            size="sm"
            className={isPlaying 
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
              : 'bg-slate-700 hover:bg-slate-600 text-white'}
            data-testid={`button-play-${voicemail.id}`}
          >
            {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          
          {voicemail.transcription && (
            <Button
              onClick={onExpand}
              size="sm"
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid={`button-transcript-${voicemail.id}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              {isExpanded ? 'Hide' : 'Read'}
            </Button>
          )}

          <div className="flex-1" />

          <Button
            onClick={onSave}
            size="icon"
            variant="ghost"
            className={voicemail.isSaved ? 'text-yellow-400' : 'text-slate-400 hover:text-yellow-400'}
            data-testid={`button-save-${voicemail.id}`}
          >
            {voicemail.isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </Button>

          <Button
            onClick={onDelete}
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-red-400"
            data-testid={`button-delete-${voicemail.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isExpanded && voicemail.transcription && (
        <div className="px-4 pb-4">
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-400 uppercase tracking-wider">
              <Volume2 className="w-3 h-3" />
              Transcription
            </div>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
              {voicemail.transcription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
