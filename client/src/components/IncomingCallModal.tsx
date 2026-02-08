import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhoneOff, Phone, PhoneIncoming, Video, User, Ticket, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { getContactByAddress } from '@/lib/storage';
import { playRingtone, stopRingtone, stopAllAudio, unlockAudio } from '@/lib/audio';
import { toast } from 'sonner';

type CallSource = 'contact' | 'invite' | 'unknown';

interface IncomingCallModalProps {
  fromAddress: string;
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
  callSource?: CallSource;
  aiWarning?: boolean;
}

export function IncomingCallModal({ fromAddress, isVideo, onAccept, onReject, callSource, aiWarning }: IncomingCallModalProps) {
  const contact = getContactByAddress(fromAddress);
  const displayName = contact?.name || fromAddress.slice(0, 20) + '...';
  const source = callSource || (contact ? 'contact' : 'unknown');
  const isHandledRef = useRef(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  
  // Start ringtone on mount
  useEffect(() => {
    const startRingtone = async () => {
      try {
        await unlockAudio();
        await playRingtone();
      } catch (error) {
        console.error('[IncomingCallModal] Failed to play ringtone:', error);
        setAudioError('Audio notification unavailable');
      }
    };
    
    startRingtone();
    
    return () => {
      stopAllAudio();
    };
  }, []);

  // Handle keyboard shortcuts - Escape to reject, Enter to accept
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isHandledRef.current) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      handleReject();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAccept();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Unlock audio on any touch/click on the modal (but not if already handled)
  const handleModalInteraction = async () => {
    if (isHandledRef.current) return;
    try {
      await unlockAudio();
      await playRingtone();
      setAudioError(null);
    } catch (error) {
      console.warn('[IncomingCallModal] Audio unlock failed:', error);
    }
  };
  
  // Handle accept - stop ringtone immediately before calling parent handler
  const handleAccept = async () => {
    if (isHandledRef.current) return;
    isHandledRef.current = true;
    setIsAccepting(true);
    
    try {
      stopAllAudio();
      await unlockAudio();
      onAccept();
    } catch (error) {
      console.error('[IncomingCallModal] Accept failed:', error);
      toast.error('Failed to accept call. Please try again.');
      isHandledRef.current = false;
      setIsAccepting(false);
    }
  };
  
  // Handle reject - stop ringtone immediately before calling parent handler
  const handleReject = () => {
    if (isHandledRef.current) return;
    isHandledRef.current = true;
    setIsRejecting(true);
    
    try {
      stopAllAudio();
      onReject();
    } catch (error) {
      console.error('[IncomingCallModal] Reject failed:', error);
      // Still close even if there's an error
      onReject();
    }
  };

  // Handle dialog close (click outside or X button)
  const handleOpenChange = (open: boolean) => {
    if (!open && !isHandledRef.current) {
      handleReject();
    }
  };

  return (
    <Dialog open={true} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="bg-slate-800 border-slate-700 text-white max-w-sm"
        onClick={handleModalInteraction}
        onTouchStart={handleModalInteraction}
        aria-label="Incoming call"
      >
        <DialogHeader className="text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 animate-pulse">
            {contact?.avatar ? (
              <img 
                src={contact.avatar} 
                alt="" 
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  // Fallback to icon if avatar fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <PhoneIncoming className="w-12 h-12 text-white" />
            )}
          </div>
          <DialogTitle className="text-xl">{displayName}</DialogTitle>
          <DialogDescription className="text-slate-400 flex items-center justify-center gap-2">
            {isVideo ? (
              <>
                <Video className="w-4 h-4" aria-hidden="true" />
                <span>Incoming video call</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" aria-hidden="true" />
                <span>Incoming voice call</span>
              </>
            )}
          </DialogDescription>
          
          {audioError && (
            <p className="text-xs text-amber-400 mt-1" role="alert">
              {audioError}
            </p>
          )}
          
          <div className="flex justify-center mt-2">
            {source === 'contact' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs">
                <Shield className="w-3 h-3" aria-hidden="true" />
                Contact
              </span>
            )}
            {source === 'invite' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                <Ticket className="w-3 h-3" aria-hidden="true" />
                Call Invite
              </span>
            )}
            {source === 'unknown' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs">
                <User className="w-3 h-3" aria-hidden="true" />
                Not in contacts
              </span>
            )}
          </div>
        </DialogHeader>

        {aiWarning && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3" data-testid="ai-warning-banner" role="alert">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-red-400 font-medium text-sm">Possible spam</p>
              <p className="text-slate-500 text-xs">AI Guardian flagged this call</p>
            </div>
          </div>
        )}

        {!contact && (
          <div className="p-3 bg-slate-900/50 rounded-xl font-mono text-xs text-emerald-400 break-all text-center" data-testid="text-incoming-address">
            {fromAddress}
          </div>
        )}

        <DialogFooter className="grid grid-cols-2 gap-4 mt-4">
          <Button
            onClick={handleReject}
            disabled={isRejecting || isAccepting}
            className="h-16 bg-red-500 hover:bg-red-600 rounded-2xl flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-reject"
            aria-label="Decline call"
          >
            {isRejecting ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <PhoneOff className="h-6 w-6" aria-hidden="true" />
            )}
            <span className="text-sm">{isRejecting ? 'Declining...' : 'Decline'}</span>
          </Button>
          <Button
            onClick={handleAccept}
            disabled={isAccepting || isRejecting}
            className="h-16 bg-emerald-500 hover:bg-emerald-600 rounded-2xl flex flex-col items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-accept"
            aria-label="Accept call"
          >
            {isAccepting ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <Phone className="h-6 w-6" aria-hidden="true" />
            )}
            <span className="text-sm">{isAccepting ? 'Connecting...' : 'Accept'}</span>
          </Button>
        </DialogFooter>
        
        <p className="text-xs text-slate-500 text-center mt-2">
          Press Enter to accept, Escape to decline
        </p>
      </DialogContent>
    </Dialog>
  );
}
