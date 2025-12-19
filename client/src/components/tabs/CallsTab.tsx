import { useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, UserPlus, Bell, Check, X, Ban, ChevronRight, MessageCircle, Ticket, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCallHistory, getContactByAddress, type CallRecord } from '@/lib/storage';
import { getLocalPasses, isLocallyBlocked } from '@/lib/policyStorage';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '@/components/Avatar';
import type { CallRequest } from '@shared/types';

interface CallsTabProps {
  onStartCall: (address: string, video: boolean) => void;
  onNavigateToAdd?: () => void;
  onNavigateToContacts?: () => void;
  onNavigateToSettings?: () => void;
  onOpenChat?: (address: string) => void;
  callRequests?: CallRequest[];
  onAcceptRequest?: (request: CallRequest) => void;
  onDeclineRequest?: (request: CallRequest) => void;
  onBlockRequester?: (address: string) => void;
}

export function CallsTab({ onStartCall, onNavigateToAdd, onNavigateToContacts, onNavigateToSettings, onOpenChat, callRequests = [], onAcceptRequest, onDeclineRequest, onBlockRequester }: CallsTabProps) {
  const [showRequests, setShowRequests] = useState(true);
  const callHistory = getCallHistory();
  const passes = getLocalPasses();

  const getCallPermissionLabel = (address: string): { label: string; color: string } => {
    const contact = getContactByAddress(address);
    if (contact) {
      return { label: 'Contact', color: 'text-emerald-400 bg-emerald-400/10' };
    }
    const hasPass = passes.some(p => p.recipient_address === address && !p.revoked && !p.burned);
    if (hasPass) {
      return { label: 'Call Invite', color: 'text-purple-400 bg-purple-400/10' };
    }
    return { label: 'Unknown', color: 'text-slate-400 bg-slate-400/10' };
  };

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

  if (callHistory.length === 0 && callRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">Only people you allow can call you</h3>
        <p className="text-slate-400 text-sm mb-6">
          Add contacts or create call invites to let others reach you
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <div className="flex gap-3">
            <Button
              onClick={onNavigateToContacts}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              data-testid="button-start-video-call-empty"
            >
              <Video className="w-4 h-4 mr-2" />
              Video Call
            </Button>
            <Button
              onClick={onNavigateToContacts}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
              data-testid="button-start-voice-call-empty"
            >
              <Phone className="w-4 h-4 mr-2" />
              Voice Call
            </Button>
          </div>
          <Button
            onClick={onNavigateToAdd}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
            data-testid="button-add-contact-empty"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {callRequests.length > 0 && (
        <div className="border-b border-slate-700">
          <button
            onClick={() => setShowRequests(!showRequests)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50"
            data-testid="button-toggle-requests"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Bell className="w-4 h-4 text-orange-400" />
              </div>
              <span className="text-white font-medium">Call Requests</span>
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs">
                {callRequests.length}
              </span>
            </div>
            <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${showRequests ? 'rotate-90' : ''}`} />
          </button>
          
          {showRequests && (
            <div className="divide-y divide-slate-800">
              {callRequests.map((request) => {
                const contact = getContactByAddress(request.from_address);
                const displayName = contact?.name || request.from_address.slice(0, 16) + '...';
                
                return (
                  <div
                    key={request.id}
                    className="p-4 bg-slate-900/50"
                    data-testid={`call-request-${request.id}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={displayName} address={request.from_address} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{displayName}</p>
                        <p className="text-slate-500 text-sm flex items-center gap-1">
                          {request.is_video ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                          <span>
                            {contact ? 'Wants to call you' : 'Not in your contacts'}
                          </span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mb-2">
                      <Button
                        onClick={() => onAcceptRequest?.(request)}
                        size="sm"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                        data-testid={`accept-request-${request.id}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        onClick={() => onOpenChat?.(request.from_address)}
                        size="sm"
                        variant="outline"
                        className="flex-1 border-slate-600 text-slate-300"
                        data-testid={`message-request-${request.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Message
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => onDeclineRequest?.(request)}
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                        data-testid={`decline-request-${request.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Ignore
                      </Button>
                      <Button
                        onClick={() => onBlockRequester?.(request.from_address)}
                        size="sm"
                        variant="ghost"
                        className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        data-testid={`block-request-${request.id}`}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Block
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
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
            <Avatar 
              name={contact?.name || call.contactName} 
              address={call.address} 
              size="md" 
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {getCallIcon(call.type)}
                <span className={`font-medium truncate ${call.type === 'missed' ? 'text-red-400' : 'text-white'}`}>
                  {displayName}
                </span>
                {(() => {
                  const perm = getCallPermissionLabel(call.address);
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${perm.color}`}>
                      {perm.label}
                    </span>
                  );
                })()}
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
    </div>
  );
}
