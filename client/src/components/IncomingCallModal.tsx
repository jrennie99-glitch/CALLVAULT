import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhoneOff, Phone, PhoneIncoming, Video, User } from 'lucide-react';
import { getContactByAddress } from '@/lib/storage';

interface IncomingCallModalProps {
  fromAddress: string;
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ fromAddress, isVideo, onAccept, onReject }: IncomingCallModalProps) {
  const contact = getContactByAddress(fromAddress);
  const displayName = contact?.name || fromAddress.slice(0, 20) + '...';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onReject()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm">
        <DialogHeader className="text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 animate-pulse">
            {contact?.avatar ? (
              <img src={contact.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <PhoneIncoming className="w-12 h-12 text-white" />
            )}
          </div>
          <DialogTitle className="text-xl">{displayName}</DialogTitle>
          <DialogDescription className="text-slate-400 flex items-center justify-center gap-2">
            {isVideo ? (
              <>
                <Video className="w-4 h-4" />
                <span>Incoming video call</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" />
                <span>Incoming voice call</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!contact && (
          <div className="p-3 bg-slate-900/50 rounded-xl font-mono text-xs text-emerald-400 break-all text-center" data-testid="text-incoming-address">
            {fromAddress}
          </div>
        )}

        <DialogFooter className="grid grid-cols-2 gap-4 mt-4">
          <Button
            onClick={onReject}
            className="h-16 bg-red-500 hover:bg-red-600 rounded-2xl flex flex-col items-center justify-center gap-1"
            data-testid="button-reject"
          >
            <PhoneOff className="h-6 w-6" />
            <span className="text-sm">Decline</span>
          </Button>
          <Button
            onClick={onAccept}
            className="h-16 bg-emerald-500 hover:bg-emerald-600 rounded-2xl flex flex-col items-center justify-center gap-1"
            data-testid="button-accept"
          >
            <Phone className="h-6 w-6" />
            <span className="text-sm">Accept</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
