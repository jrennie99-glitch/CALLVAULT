import { Video, Phone, X, Check, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';
import { getContactByAddress } from '@/lib/storage';
import type { CallRequest } from '@shared/types';

interface CallRequestModalProps {
  request: CallRequest;
  onAccept: () => void;
  onDecline: () => void;
}

export function CallRequestModal({ request, onAccept, onDecline }: CallRequestModalProps) {
  const contact = getContactByAddress(request.from_address);
  const displayName = contact?.name || 'Unknown Caller';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex justify-center">
            <Avatar name={displayName} address={request.from_address} size="lg" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{displayName}</h2>
          <div className="flex items-center justify-center gap-2 text-slate-400">
            {request.is_video ? (
              <>
                <Video className="w-5 h-5" />
                <span>wants to video call you</span>
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                <span>wants to call you</span>
              </>
            )}
          </div>
          {!contact && (
            <div className="mt-3 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-orange-400 text-sm flex items-center justify-center gap-2">
                <User className="w-4 h-4" />
                This person is not in your contacts
              </p>
            </div>
          )}
        </div>

        <p className="text-slate-500 text-sm mb-6 font-mono break-all px-4">
          {request.from_address}
        </p>

        <div className="flex justify-center gap-6">
          <Button
            onClick={onDecline}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 p-0"
            data-testid="button-decline-request"
          >
            <X className="w-8 h-8" />
          </Button>
          <Button
            onClick={onAccept}
            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 p-0"
            data-testid="button-accept-request"
          >
            <Check className="w-8 h-8" />
          </Button>
        </div>

        <p className="text-slate-600 text-xs mt-6">
          Accepting will allow them to call you this time
        </p>
      </div>
    </div>
  );
}
