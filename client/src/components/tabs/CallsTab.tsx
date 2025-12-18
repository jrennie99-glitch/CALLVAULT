import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import { getCallHistory, getContactByAddress, type CallRecord } from '@/lib/storage';
import { formatDistanceToNow } from 'date-fns';

interface CallsTabProps {
  onStartCall: (address: string, video: boolean) => void;
}

export function CallsTab({ onStartCall }: CallsTabProps) {
  const callHistory = getCallHistory();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallIcon = (type: CallRecord['type']) => {
    switch (type) {
      case 'incoming':
        return <PhoneIncoming className="w-4 h-4 text-emerald-400" />;
      case 'outgoing':
        return <PhoneOutgoing className="w-4 h-4 text-blue-400" />;
      case 'missed':
        return <PhoneMissed className="w-4 h-4 text-red-400" />;
    }
  };

  if (callHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <Phone className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-300 mb-2">No Recent Calls</h3>
        <p className="text-slate-500 text-sm">
          Your call history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-800">
      {callHistory.map((call) => {
        const contact = call.contactId ? getContactByAddress(call.address) : undefined;
        const displayName = contact?.name || call.contactName || call.address.slice(0, 20) + '...';

        return (
          <button
            key={call.id}
            onClick={() => onStartCall(call.address, call.mediaType === 'video')}
            className="w-full flex items-center gap-4 p-4 hover:bg-slate-800/50 transition-colors text-left"
            data-testid={`call-record-${call.id}`}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0">
              {call.mediaType === 'video' ? (
                <Video className="w-5 h-5 text-slate-300" />
              ) : (
                <Phone className="w-5 h-5 text-slate-300" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {getCallIcon(call.type)}
                <span className={`font-medium truncate ${call.type === 'missed' ? 'text-red-400' : 'text-white'}`}>
                  {displayName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{formatDistanceToNow(call.timestamp, { addSuffix: true })}</span>
                {call.duration && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(call.duration)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              {call.mediaType === 'video' ? (
                <Video className="w-5 h-5 text-emerald-400" />
              ) : (
                <Phone className="w-5 h-5 text-emerald-400" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
