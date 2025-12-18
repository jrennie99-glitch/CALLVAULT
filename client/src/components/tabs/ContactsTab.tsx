import { useState } from 'react';
import { Search, User, Video, Phone, Trash2, ChevronLeft, UserPlus, QrCode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getContacts, deleteContact, type Contact } from '@/lib/storage';
import { Avatar } from '@/components/Avatar';
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

interface ContactsTabProps {
  onStartCall: (address: string, video: boolean) => void;
  onNavigateToAdd?: () => void;
  onShareQR?: () => void;
}

export function ContactsTab({ onStartCall, onNavigateToAdd, onShareQR }: ContactsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [, forceUpdate] = useState({});

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
          <p className="text-slate-400 text-sm font-mono break-all px-4">
            {selectedContact.address}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button
            onClick={() => onStartCall(selectedContact.address, true)}
            className="h-16 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 flex flex-col items-center justify-center gap-1 rounded-2xl"
            data-testid="button-contact-video-call"
          >
            <Video className="h-6 w-6" />
            <span className="text-sm">Video Call</span>
          </Button>
          <Button
            onClick={() => onStartCall(selectedContact.address, false)}
            className="h-16 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 flex flex-col items-center justify-center gap-1 rounded-2xl"
            data-testid="button-contact-voice-call"
          >
            <Phone className="h-6 w-6" />
            <span className="text-sm">Voice Call</span>
          </Button>
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
            <button
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className="w-full flex items-center gap-4 p-4 hover:bg-slate-800/50 transition-colors text-left"
              data-testid={`contact-${contact.id}`}
            >
              {contact.avatar ? (
                <img src={contact.avatar} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <Avatar name={contact.name} address={contact.address} size="md" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">{contact.name}</div>
                <div className="text-sm text-slate-500 truncate font-mono">
                  {contact.address.slice(0, 25)}...
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
