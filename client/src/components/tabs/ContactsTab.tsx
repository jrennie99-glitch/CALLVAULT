import { useState, useEffect } from 'react';
import { Search, User, Video, Phone, Trash2, ChevronLeft, UserPlus, QrCode, MessageSquare, Shield, Ban, Check, Ticket, Snowflake } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getContacts, deleteContact, type Contact } from '@/lib/storage';
import { Avatar } from '@/components/Avatar';
import { getLocalOverrides, saveLocalOverride, deleteLocalOverride, isLocallyBlocked, addToLocalBlocklist, removeFromLocalBlocklist, getLocalPasses, saveLocalPass } from '@/lib/policyStorage';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type PermissionStatus = 'allowed' | 'blocked' | 'default';

function getContactPermissionStatus(address: string): PermissionStatus {
  if (isLocallyBlocked(address)) return 'blocked';
  const overrides = getLocalOverrides();
  const override = overrides.find(o => o.contact_address === address);
  if (override?.permission === 'always') return 'allowed';
  if (override?.permission === 'blocked') return 'blocked';
  return 'default';
}

interface ContactsTabProps {
  onStartCall: (address: string, video: boolean) => void;
  onNavigateToAdd?: () => void;
  onShareQR?: () => void;
  onOpenChat?: (address: string) => void;
  ownerAddress?: string;
}

export function ContactsTab({ onStartCall, onNavigateToAdd, onShareQR, onOpenChat, ownerAddress }: ContactsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [, forceUpdate] = useState({});
  const [alwaysAllowedContacts, setAlwaysAllowedContacts] = useState<Set<string>>(new Set());
  const [isTogglingAlwaysAllowed, setIsTogglingAlwaysAllowed] = useState(false);

  useEffect(() => {
    if (ownerAddress) {
      fetch(`/api/contacts/${ownerAddress}/always-allowed`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch');
          return res.json();
        })
        .then(data => {
          if (data.alwaysAllowed && Array.isArray(data.alwaysAllowed)) {
            setAlwaysAllowedContacts(new Set(data.alwaysAllowed));
          }
        })
        .catch(err => {
          console.error('Error fetching always-allowed contacts:', err);
        });
    }
  }, [ownerAddress]);

  const handleToggleAlwaysAllowed = async (contactAddress: string, enabled: boolean) => {
    if (!ownerAddress) {
      toast.error('No owner address available');
      return;
    }
    
    setIsTogglingAlwaysAllowed(true);
    try {
      const res = await fetch(`/api/contacts/${ownerAddress}/${contactAddress}/always-allowed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alwaysAllowed: enabled })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update');
      }
      
      setAlwaysAllowedContacts(prev => {
        const newSet = new Set(prev);
        if (enabled) {
          newSet.add(contactAddress);
        } else {
          newSet.delete(contactAddress);
        }
        return newSet;
      });
      toast.success(enabled ? 'Contact added to Always Allowed' : 'Contact removed from Always Allowed');
    } catch (error) {
      console.error('Error updating Always Allowed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update Always Allowed status');
    } finally {
      setIsTogglingAlwaysAllowed(false);
    }
  };

  const contacts = getContacts();
  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteContact(deleteConfirm.id);
      setDeleteConfirm(null);
      setSelectedContact(null);
      forceUpdate({});
    }
  };

  if (selectedContact) {
    return (
      <div className="p-4">
        <button
          onClick={() => setSelectedContact(null)}
          className="flex items-center gap-2 text-emerald-400 mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Contacts</span>
        </button>

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex justify-center">
            {selectedContact.avatar ? (
              <img src={selectedContact.avatar} alt="" className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <Avatar name={selectedContact.name} address={selectedContact.address} size="lg" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{selectedContact.name}</h2>
          <p className="text-slate-400 text-sm font-mono break-all px-4 mb-3">
            {selectedContact.address}
          </p>
          
          {(() => {
            const status = getContactPermissionStatus(selectedContact.address);
            return (
              <div className="flex justify-center">
                {status === 'allowed' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
                    <Check className="w-4 h-4" />
                    Always allowed
                  </span>
                )}
                {status === 'blocked' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                    <Ban className="w-4 h-4" />
                    Blocked
                  </span>
                )}
                {status === 'default' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-sm">
                    <Shield className="w-4 h-4" />
                    Default settings
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Button
            onClick={() => onOpenChat?.(selectedContact.address)}
            className="h-16 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 flex flex-col items-center justify-center gap-1 rounded-2xl"
            data-testid="button-contact-message"
          >
            <MessageSquare className="h-6 w-6" />
            <span className="text-sm">Message</span>
          </Button>
          {getContactPermissionStatus(selectedContact.address) === 'blocked' ? (
            <Button
              disabled
              className="h-16 bg-slate-700 flex flex-col items-center justify-center gap-1 rounded-2xl cursor-not-allowed opacity-50"
              data-testid="button-contact-video-call"
            >
              <Video className="h-6 w-6" />
              <span className="text-sm">Blocked</span>
            </Button>
          ) : (
            <Button
              onClick={() => onStartCall(selectedContact.address, true)}
              className="h-16 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 flex flex-col items-center justify-center gap-1 rounded-2xl"
              data-testid="button-contact-video-call"
            >
              <Video className="h-6 w-6" />
              <span className="text-sm">Video</span>
            </Button>
          )}
          {getContactPermissionStatus(selectedContact.address) === 'blocked' ? (
            <Button
              disabled
              className="h-16 bg-slate-700 flex flex-col items-center justify-center gap-1 rounded-2xl cursor-not-allowed opacity-50"
              data-testid="button-contact-voice-call"
            >
              <Phone className="h-6 w-6" />
              <span className="text-sm">Blocked</span>
            </Button>
          ) : (
            <Button
              onClick={() => onStartCall(selectedContact.address, false)}
              className="h-16 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 flex flex-col items-center justify-center gap-1 rounded-2xl"
              data-testid="button-contact-voice-call"
            >
              <Phone className="h-6 w-6" />
              <span className="text-sm">Call</span>
            </Button>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 space-y-3">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Quick Actions</h3>
          {getContactPermissionStatus(selectedContact.address) === 'blocked' ? (
            <Button
              onClick={() => {
                removeFromLocalBlocklist(selectedContact.address);
                forceUpdate({});
                toast.success('Contact unblocked');
              }}
              variant="ghost"
              className="w-full justify-start text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              data-testid="button-unblock-contact"
            >
              <Check className="w-4 h-4 mr-3" />
              Unblock this contact
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  saveLocalOverride({
                    owner_address: '',
                    contact_address: selectedContact.address,
                    permission: 'always',
                    updated_at: Date.now()
                  });
                  forceUpdate({});
                  toast.success('Contact set to always allow calls');
                }}
                variant="ghost"
                className="w-full justify-start text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                data-testid="button-allow-always"
              >
                <Check className="w-4 h-4 mr-3" />
                Always allow calls
              </Button>
              <Button
                onClick={() => {
                  addToLocalBlocklist({
                    owner_address: '',
                    blocked_address: selectedContact.address,
                    reason: 'Manual block',
                    blocked_at: Date.now()
                  });
                  forceUpdate({});
                  toast.success('Contact blocked');
                }}
                variant="ghost"
                className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                data-testid="button-block-contact"
              >
                <Ban className="w-4 h-4 mr-3" />
                Block this contact
              </Button>
              <Button
                onClick={() => {
                  const passId = crypto.randomUUID();
                  const pass = {
                    id: passId,
                    recipient_address: selectedContact.address,
                    created_by: '',
                    pass_type: 'one_time' as const,
                    created_at: Date.now(),
                    burned: false,
                    revoked: false
                  };
                  saveLocalPass(pass);
                  navigator.clipboard.writeText(`call-invite:${passId}`);
                  toast.success('Call invite created and copied!');
                }}
                variant="ghost"
                className="w-full justify-start text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                data-testid="button-create-invite"
              >
                <Ticket className="w-4 h-4 mr-3" />
                Create one-time call invite
              </Button>
            </>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-cyan-400" />
            Freeze Mode
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">Always Allowed</p>
              <p className="text-slate-500 text-xs">
                This contact can reach you even when Freeze Mode is on
              </p>
            </div>
            <Switch
              checked={alwaysAllowedContacts.has(selectedContact.address)}
              onCheckedChange={(enabled) => handleToggleAlwaysAllowed(selectedContact.address, enabled)}
              disabled={isTogglingAlwaysAllowed}
              data-testid="switch-always-allowed"
            />
          </div>
        </div>

        <Button
          onClick={() => setDeleteConfirm(selectedContact)}
          variant="ghost"
          className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Contact
        </Button>

        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Contact</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete {deleteConfirm?.name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div>
      <div className="p-4 sticky top-14 bg-slate-900/95 backdrop-blur-lg z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            data-testid="input-search-contacts"
          />
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <User className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">
            {contacts.length === 0 ? 'No Contacts Yet' : 'No Results'}
          </h3>
          <p className="text-slate-500 text-sm mb-6">
            {contacts.length === 0
              ? 'Add your first contact to get started'
              : 'Try a different search term'}
          </p>
          {contacts.length === 0 && (
            <div className="flex gap-3">
              <Button
                onClick={onNavigateToAdd}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                data-testid="button-add-contact-empty-contacts"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
              <Button
                onClick={onShareQR}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
                data-testid="button-share-qr-empty"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Share My QR
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors"
              data-testid={`contact-${contact.id}`}
            >
              <button
                onClick={() => setSelectedContact(contact)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {contact.avatar ? (
                  <img src={contact.avatar} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <Avatar name={contact.name} address={contact.address} size="md" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{contact.name}</div>
                  <div className="text-sm text-slate-500 truncate font-mono">
                    {contact.address.slice(0, 20)}...
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartCall(contact.address, true);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  data-testid={`button-video-call-${contact.id}`}
                  title="Video Call"
                >
                  <Video className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartCall(contact.address, false);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors"
                  data-testid={`button-audio-call-${contact.id}`}
                  title="Voice Call"
                >
                  <Phone className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
