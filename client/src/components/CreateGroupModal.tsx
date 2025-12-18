import { useState } from 'react';
import { X, Users, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/Avatar';
import { getContacts, type Contact } from '@/lib/storage';
import { toast } from 'sonner';

interface CreateGroupModalProps {
  onClose: () => void;
  onCreate: (name: string, participants: string[]) => void;
}

export function CreateGroupModal({ onClose, onCreate }: CreateGroupModalProps) {
  const [step, setStep] = useState<'name' | 'members'>('name');
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const contacts = getContacts();

  const toggleContact = (address: string) => {
    setSelectedContacts(prev => 
      prev.includes(address)
        ? prev.filter(a => a !== address)
        : [...prev, address]
    );
  };

  const handleNext = () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    setStep('members');
  };

  const handleCreate = () => {
    if (selectedContacts.length === 0) {
      toast.error('Please select at least one member');
      return;
    }
    onCreate(groupName.trim(), selectedContacts);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            {step === 'name' ? 'New Group' : 'Add Members'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
            data-testid="button-close-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {step === 'name' ? (
          <div className="p-4 space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Users className="w-10 h-10 text-white" />
              </div>
            </div>
            
            <div>
              <Label className="text-slate-300">Group Name</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name..."
                className="mt-1 bg-slate-800/50 border-slate-700 text-white"
                data-testid="input-group-name"
                autoFocus
              />
            </div>

            <Button
              onClick={handleNext}
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              data-testid="button-next"
            >
              Next
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <p className="text-sm text-slate-400">
                {selectedContacts.length} member{selectedContacts.length !== 1 ? 's' : ''} selected
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
              {contacts.map(contact => {
                const isSelected = selectedContacts.includes(contact.address);
                return (
                  <button
                    key={contact.id}
                    onClick={() => toggleContact(contact.address)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors text-left"
                    data-testid={`contact-select-${contact.id}`}
                  >
                    <Avatar name={contact.name} address={contact.address} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{contact.name}</div>
                      <div className="text-sm text-slate-500 truncate font-mono">
                        {contact.address.slice(0, 20)}...
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected 
                        ? 'bg-emerald-500 border-emerald-500' 
                        : 'border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })}
              
              {contacts.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <p>No contacts to add</p>
                  <p className="text-sm mt-1">Add some contacts first</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800">
              <Button
                onClick={handleCreate}
                disabled={selectedContacts.length === 0}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
                data-testid="button-create-group"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Group
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
