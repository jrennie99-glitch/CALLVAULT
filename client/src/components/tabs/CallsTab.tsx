import { useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, UserPlus, Bell, Check, X, Ban, ChevronRight, MessageCircle, Ticket, Shield, Briefcase, DollarSign, Link2, Users, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCallHistory, getContactByAddress, type CallRecord } from '@/lib/storage';
import { getLocalPasses, isLocallyBlocked, getCreatorProfile, getCallPricingSettings, formatPrice } from '@/lib/policyStorage';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '@/components/Avatar';
import { toast } from 'sonner';
import type { CallRequest, QueueEntry } from '@shared/types';

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
  callQueue?: QueueEntry[];
  onAcceptQueueEntry?: (entry: QueueEntry) => void;
  onSkipQueueEntry?: (entry: QueueEntry) => void;
}

export function CallsTab({ onStartCall, onNavigateToAdd, onNavigateToContacts, onNavigateToSettings, onOpenChat, callRequests = [], onAcceptRequest, onDeclineRequest, onBlockRequester, callQueue = [], onAcceptQueueEntry, onSkipQueueEntry }: CallsTabProps) {
  const [showRequests, setShowRequests] = useState(true);
  const [showQueue, setShowQueue] = useState(true);
  const [showPaidLinkModal, setShowPaidLinkModal] = useState(false);
  const callHistory = getCallHistory();
  const passes = getLocalPasses();
  const creatorProfile = getCreatorProfile();
  const pricing = getCallPricingSettings();
  const isBusinessMode = creatorProfile?.enabled ?? false;

  const generatePaidCallLink = () => {
    const tokenId = `paid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const link = `${window.location.origin}/pay/${tokenId}`;
    navigator.clipboard.writeText(link);
    toast.success('Paid call link copied!');
    setShowPaidLinkModal(false);
  };

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
    if (isBusinessMode) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
            <DollarSign className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Get paid for your time</h3>
          <p className="text-slate-400 text-sm mb-6">
            Create paid call links to earn from your expertise
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              onClick={() => setShowPaidLinkModal(true)}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
              data-testid="button-create-paid-link-empty"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Create Paid Call Link
            </Button>
            <Button
              onClick={() => {
                const handle = creatorProfile?.handle || creatorProfile?.address.slice(5, 15);
                const profileUrl = `${window.location.origin}/u/${handle}`;
                navigator.clipboard.writeText(profileUrl);
                toast.success('Profile link copied!');
              }}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
              data-testid="button-view-profile-empty"
            >
              <Briefcase className="w-4 h-4 mr-2" />
              View My Profile
            </Button>
          </div>
        </div>
      );
    }

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
      {isBusinessMode && (
        <div className="p-4 border-b border-slate-700">
          <Button
            onClick={() => setShowPaidLinkModal(true)}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            data-testid="button-create-paid-link"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Create Paid Call Link
          </Button>
        </div>
      )}

      {showPaidLinkModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Paid Call Link</h3>
                <p className="text-slate-400 text-sm">Share to get paid for calls</p>
              </div>
            </div>
            
            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <p className="text-slate-300 text-sm mb-2">Pricing:</p>
              {pricing?.mode === 'per_session' ? (
                <p className="text-white font-medium">
                  {formatPrice(pricing.session_price_cents || 2500)} / {pricing.session_duration_minutes || 15} min session
                </p>
              ) : (
                <p className="text-white font-medium">
                  {formatPrice(pricing?.per_minute_price_cents || 200)} / minute
                </p>
              )}
              {pricing?.free_first_call && (
                <p className="text-emerald-400 text-xs mt-1">First call free for new contacts</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowPaidLinkModal(false)}
                variant="outline"
                className="flex-1 border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={generatePaidCallLink}
                className="flex-1 bg-purple-500 hover:bg-purple-600"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Generate Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {callQueue.length > 0 && (
        <div className="border-b border-slate-700">
          <button
            onClick={() => setShowQueue(!showQueue)}
            className="w-full flex items-center justify-between px-4 py-3 bg-purple-500/10"
            data-testid="button-toggle-queue"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-white font-medium">Call Queue</span>
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                {callQueue.length}
              </span>
            </div>
            <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${showQueue ? 'rotate-90' : ''}`} />
          </button>
          
          {showQueue && (
            <div className="divide-y divide-slate-800">
              {callQueue.map((entry) => {
                const contact = getContactByAddress(entry.caller_address);
                const displayName = contact?.name || entry.caller_address.slice(0, 16) + '...';
                return (
                  <div key={entry.id} className="p-4 bg-slate-900/30">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar address={entry.caller_address} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{displayName}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_paid ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                            {entry.is_paid ? 'Paid' : 'Free'}
                          </span>
                          <span className="text-slate-500 text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            ~{entry.estimated_wait_minutes}m wait
                          </span>
                        </div>
                      </div>
                      <span className="text-purple-400 font-medium">#{entry.position}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => onAcceptQueueEntry?.(entry)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onOpenChat?.(entry.caller_address)}
                        variant="outline"
                        className="border-slate-600"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onSkipQueueEntry?.(entry)}
                        variant="outline"
                        className="border-slate-600"
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
