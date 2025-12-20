import { Phone, Video, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GroupCallInviteModalProps {
  isOpen: boolean;
  roomId: string;
  fromAddress: string;
  isVideo: boolean;
  onAccept: () => void;
  onDecline: () => void;
  getContactName?: (address: string) => string;
}

export function GroupCallInviteModal({
  isOpen,
  roomId,
  fromAddress,
  isVideo,
  onAccept,
  onDecline,
  getContactName
}: GroupCallInviteModalProps) {
  const displayName = getContactName?.(fromAddress) || fromAddress.slice(0, 16) + '...';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="sm:max-w-md" data-testid="modal-group-call-invite">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Users className="w-10 h-10 text-primary" />
              </div>
              {isVideo && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-2">
                  <Video className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          </div>
          <DialogTitle className="text-center text-xl" data-testid="text-invite-from">
            Group Call Invite
          </DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium">{displayName}</span> invited you to a {isVideo ? 'video' : 'voice'} group call
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-3 sm:justify-center pt-4">
          <Button
            variant="destructive"
            size="lg"
            className="flex-1 rounded-full"
            onClick={onDecline}
            data-testid="button-decline-group-invite"
          >
            <X className="w-5 h-5 mr-2" />
            Decline
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1 rounded-full bg-green-600 hover:bg-green-700"
            onClick={onAccept}
            data-testid="button-accept-group-invite"
          >
            {isVideo ? <Video className="w-5 h-5 mr-2" /> : <Phone className="w-5 h-5 mr-2" />}
            Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
