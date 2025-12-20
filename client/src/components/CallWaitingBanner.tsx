import { PhoneCall, PhoneForwarded, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WaitingCall } from '@/hooks/useCallWaiting';

interface CallWaitingBannerProps {
  waitingCalls: WaitingCall[];
  isOnHold: boolean;
  heldBy: string | null;
  onAccept: (address: string) => void;
  onDecline: (address: string) => void;
  onHoldAndSwitch: (waitingAddress: string, currentAddress: string) => void;
  onMerge?: () => void;
  currentCallAddress: string;
  getContactName?: (address: string) => string;
  canMerge?: boolean;
}

export function CallWaitingBanner({
  waitingCalls,
  isOnHold,
  heldBy,
  onAccept,
  onDecline,
  onHoldAndSwitch,
  onMerge,
  currentCallAddress,
  getContactName,
  canMerge = false
}: CallWaitingBannerProps) {
  if (waitingCalls.length === 0 && !isOnHold) return null;

  const getDisplayName = (address: string) => 
    getContactName?.(address) || address.slice(0, 12) + '...';

  return (
    <div className="fixed top-20 left-0 right-0 z-50 px-4" data-testid="call-waiting-banner">
      {isOnHold && heldBy && (
        <div className="bg-yellow-500/90 rounded-lg px-4 py-3 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <PhoneCall className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-medium">
              Call on hold by {getDisplayName(heldBy)}
            </span>
          </div>
        </div>
      )}

      {waitingCalls.map((call) => (
        <div 
          key={call.from_address}
          className="bg-blue-500/90 rounded-lg px-4 py-3 mb-2 flex items-center justify-between"
          data-testid={`banner-waiting-call-${call.from_address}`}
        >
          <div className="flex items-center gap-2 text-white">
            <PhoneCall className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-medium">
              {getDisplayName(call.from_address)} is calling...
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canMerge && onMerge && (
              <Button
                size="sm"
                variant="outline"
                className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                onClick={onMerge}
                data-testid="button-merge-calls"
              >
                <Users className="w-4 h-4 mr-1" />
                Merge
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="bg-white/20 border-white/30 text-white hover:bg-white/30"
              onClick={() => onHoldAndSwitch(call.from_address, currentCallAddress)}
              data-testid="button-hold-switch"
            >
              <PhoneForwarded className="w-4 h-4 mr-1" />
              Switch
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDecline(call.from_address)}
              data-testid="button-decline-waiting"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
