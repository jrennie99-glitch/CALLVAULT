import { useState, useEffect } from 'react';
import { QrCode, Copy, UserPlus, Link, CheckCircle, Video, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { addContact, getContactByAddress } from '@/lib/storage';
import { toast } from 'sonner';
import QRCode from 'qrcode';

interface AddTabProps {
  myAddress: string;
  onContactAdded: () => void;
  onStartCall?: (address: string, video: boolean) => void;
}

export function AddTab({ myAddress, onContactAdded, onStartCall }: AddTabProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactAddress, setNewContactAddress] = useState('');
  const [pastedQrPayload, setPastedQrPayload] = useState('');
  const [quickCallAddress, setQuickCallAddress] = useState('');
  const [quickCallType, setQuickCallType] = useState<'video' | 'audio'>('video');

  useEffect(() => {
    if (myAddress) {
      QRCode.toDataURL(myAddress, {
        width: 256,
        margin: 2,
        color: {
          dark: '#10b981',
          light: '#1e293b'
        }
      }).then(setQrDataUrl).catch(console.error);
    }
  }, [myAddress]);

  const handleAddContact = () => {
    if (!newContactName.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!newContactAddress.trim() || !newContactAddress.startsWith('call:')) {
      toast.error('Please enter a valid call address');
      return;
    }

    const existing = getContactByAddress(newContactAddress);
    if (existing) {
      toast.error('This contact already exists');
      return;
    }

    addContact({
      name: newContactName.trim(),
      address: newContactAddress.trim()
    });

    setNewContactName('');
    setNewContactAddress('');
    toast.success('Contact added!');
    onContactAdded();
  };

  const handlePasteQrPayload = () => {
    if (!pastedQrPayload.trim() || !pastedQrPayload.startsWith('call:')) {
      toast.error('Invalid QR payload');
      return;
    }
    setNewContactAddress(pastedQrPayload.trim());
    setPastedQrPayload('');
    toast.success('Address loaded from QR payload');
  };

  const copyMyAddress = () => {
    navigator.clipboard.writeText(myAddress);
    toast.success('Address copied!');
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}?invite=${encodeURIComponent(myAddress)}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied!');
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            My QR Code
          </CardTitle>
          <CardDescription className="text-slate-400">
            Others can scan this to add you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrDataUrl && (
            <div className="flex justify-center">
              <img 
                src={qrDataUrl} 
                alt="My QR Code" 
                className="rounded-2xl"
                data-testid="img-my-qr"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={copyMyAddress}
              variant="outline"
              className="border-slate-600 hover:bg-slate-700"
              data-testid="button-copy-my-address"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Address
            </Button>
            <Button
              onClick={copyInviteLink}
              variant="outline"
              className="border-slate-600 hover:bg-slate-700"
              data-testid="button-copy-invite-link"
            >
              <Link className="w-4 h-4 mr-2" />
              Invite Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Contact
          </CardTitle>
          <CardDescription className="text-slate-400">
            Add a new contact by their call address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Name</Label>
            <Input
              placeholder="Contact name"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              className="mt-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              data-testid="input-contact-name"
            />
          </div>
          <div>
            <Label className="text-slate-300">Call Address</Label>
            <Input
              placeholder="call:..."
              value={newContactAddress}
              onChange={(e) => setNewContactAddress(e.target.value)}
              className="mt-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 font-mono text-sm"
              data-testid="input-contact-address"
            />
          </div>
          <Button
            onClick={handleAddContact}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            disabled={!newContactName || !newContactAddress}
            data-testid="button-add-contact"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Quick Call
          </CardTitle>
          <CardDescription className="text-slate-400">
            Call someone directly by their Call ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Call ID</Label>
            <Input
              placeholder="call:..."
              value={quickCallAddress}
              onChange={(e) => setQuickCallAddress(e.target.value)}
              className="mt-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 font-mono text-sm"
              data-testid="input-quick-call-address"
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-2 block">Call Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setQuickCallType('video')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-colors ${
                  quickCallType === 'video'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'bg-slate-900/50 border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
                data-testid="button-call-type-video"
              >
                <Video className="w-5 h-5" />
                <span>Video</span>
              </button>
              <button
                onClick={() => setQuickCallType('audio')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-colors ${
                  quickCallType === 'audio'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                    : 'bg-slate-900/50 border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
                data-testid="button-call-type-audio"
              >
                <Phone className="w-5 h-5" />
                <span>Audio</span>
              </button>
            </div>
          </div>
          <Button
            onClick={() => {
              if (!quickCallAddress.trim() || !quickCallAddress.startsWith('call:')) {
                toast.error('Please enter a valid Call ID');
                return;
              }
              onStartCall?.(quickCallAddress.trim(), quickCallType === 'video');
            }}
            className={`w-full h-14 rounded-2xl text-lg font-medium ${
              quickCallType === 'video'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
            }`}
            disabled={!quickCallAddress || !onStartCall}
            data-testid="button-call-now"
          >
            {quickCallType === 'video' ? (
              <>
                <Video className="w-5 h-5 mr-2" />
                Video Call Now
              </>
            ) : (
              <>
                <Phone className="w-5 h-5 mr-2" />
                Voice Call Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Paste QR Payload</CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            If you can't scan, paste the QR code text
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Paste QR payload here..."
            value={pastedQrPayload}
            onChange={(e) => setPastedQrPayload(e.target.value)}
            className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 font-mono text-sm"
            data-testid="input-qr-payload"
          />
          <Button
            onClick={handlePasteQrPayload}
            variant="outline"
            className="w-full border-slate-600 hover:bg-slate-700"
            disabled={!pastedQrPayload}
          >
            Load Address
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
