import { useState, useEffect } from 'react';
import { QrCode, Copy, UserPlus, Link, CheckCircle, Video, Phone, Ticket, DollarSign, Briefcase, ChevronRight, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addContact, getContactByAddress } from '@/lib/storage';
import { getCreatorProfile } from '@/lib/policyStorage';
import { copyToClipboard } from '@/lib/clipboard';
import QRCode from 'qrcode';
import { Scanner } from '@yudiel/react-qr-scanner';

interface AddTabProps {
  myAddress: string;
  onContactAdded: () => void;
  onStartCall?: (address: string, video: boolean) => void;
  onNavigateToInvites?: () => void;
  onNavigateToPaidLinks?: () => void;
}

export function AddTab({ myAddress, onContactAdded, onStartCall, onNavigateToInvites, onNavigateToPaidLinks }: AddTabProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactAddress, setNewContactAddress] = useState('');
  const [pastedQrPayload, setPastedQrPayload] = useState('');
  const [quickCallAddress, setQuickCallAddress] = useState('');
  const [quickCallType, setQuickCallType] = useState<'video' | 'audio'>('video');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const creatorProfile = getCreatorProfile();
  const isBusinessMode = creatorProfile?.enabled ?? false;

  const handleScan = (detectedCodes: { rawValue: string }[]) => {
    if (detectedCodes.length > 0) {
      const scannedValue = detectedCodes[0].rawValue;
      if (scannedValue.startsWith('call:')) {
        setNewContactAddress(scannedValue);
        setShowScanner(false);
        setScannerError(null);
        toast.success('QR code scanned! Enter a name for this contact.');
      } else {
        setScannerError('Invalid QR code - must be a Call Vault address');
      }
    }
  };

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
    }, myAddress);

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
    copyToClipboard(myAddress, 'Address copied!');
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}?invite=${encodeURIComponent(myAddress)}`;
    copyToClipboard(inviteLink, 'Invite link copied!');
  };

  const copyProfileLink = () => {
    const handle = creatorProfile?.handle || myAddress.slice(5, 15);
    const profileUrl = `${window.location.origin}/u/${handle}`;
    copyToClipboard(profileUrl, 'Profile link copied!');
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Quick Actions</h3>
        
        <button
          onClick={onNavigateToInvites}
          className="w-full flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors"
          data-testid="card-invite-link"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">Invite Call Link</p>
              <p className="text-slate-500 text-sm">Let someone call you once</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </button>

        {isBusinessMode && (
          <button
            onClick={onNavigateToPaidLinks}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl hover:from-purple-500/20 hover:to-pink-500/20 transition-all"
            data-testid="card-paid-link"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-medium flex items-center gap-2">
                  Paid Call Link
                  <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Pro</span>
                </p>
                <p className="text-slate-500 text-sm">Earn from your calls</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        )}

        {isBusinessMode && (
          <button
            onClick={copyProfileLink}
            className="w-full flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors"
            data-testid="card-share-profile"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-medium">Share My Profile</p>
                <p className="text-slate-500 text-sm">Public business page</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        )}
      </div>

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
              className="border-slate-600 hover:bg-slate-700 text-white"
              data-testid="button-copy-my-address"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Address
            </Button>
            <Button
              onClick={copyInviteLink}
              variant="outline"
              className="border-slate-600 hover:bg-slate-700 text-white"
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
            Scan a QR code or enter their call address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => {
              setScannerError(null);
              setShowScanner(true);
            }}
            variant="outline"
            className="w-full border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            data-testid="button-scan-qr"
          >
            <ScanLine className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-800 px-2 text-slate-500">or enter manually</span>
            </div>
          </div>

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

      <Dialog open={showScanner} onOpenChange={(open) => {
          setShowScanner(open);
          if (!open) setScannerError(null);
        }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg p-0 overflow-hidden [&>button]:hidden">
          <div className="relative min-h-[500px] flex flex-col">
            <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <ScanLine className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Scan QR Code</h3>
                    <p className="text-slate-400 text-xs">Point camera at a Call Vault code</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowScanner(false)}
                  className="text-white hover:bg-white/10 rounded-full"
                  data-testid="button-close-scanner"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            </div>
            
            <div className="flex-1 relative bg-black">
              {showScanner && !scannerError && (
                <Scanner
                  onScan={(detectedCodes) => {
                    if (detectedCodes && detectedCodes.length > 0) {
                      handleScan(detectedCodes);
                    }
                  }}
                  onError={(error: unknown) => {
                    console.error('Scanner error:', error);
                    const err = error as any;
                    if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
                      setScannerError('Camera access denied. Please allow camera access in your browser settings.');
                    } else if (err?.name === 'NotFoundError' || err?.message?.includes('not found')) {
                      setScannerError('No camera found on this device.');
                    } else if (err?.name === 'NotReadableError') {
                      setScannerError('Camera is in use by another app.');
                    } else {
                      setScannerError('Unable to access camera. Please try again.');
                    }
                  }}
                  constraints={{
                    facingMode: 'environment'
                  }}
                  formats={['qr_code']}
                  scanDelay={300}
                  styles={{
                    container: { width: '100%', height: '100%', position: 'absolute', inset: 0 },
                    video: { width: '100%', height: '100%', objectFit: 'cover' }
                  }}
                  components={{
                    torch: false,
                    finder: false
                  }}
                />
              )}
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-64 h-64">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
                  
                  <div className="absolute inset-0 overflow-hidden">
                    <div 
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse"
                      style={{
                        animation: 'scanLine 2s ease-in-out infinite',
                        top: '50%'
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="absolute inset-0 bg-black/50 pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 bg-transparent" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
                </div>
              </div>
              
              {scannerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-white text-center font-medium mb-2">Camera Error</p>
                  <p className="text-slate-400 text-center text-sm mb-6">{scannerError}</p>
                  <div className="space-y-3 w-full max-w-xs">
                    <Button
                      onClick={() => {
                        setScannerError(null);
                        setShowScanner(false);
                        setTimeout(() => setShowScanner(true), 100);
                      }}
                      className="w-full bg-emerald-500 hover:bg-emerald-600"
                      data-testid="button-retry-camera"
                    >
                      Try Again
                    </Button>
                    <Button
                      onClick={() => setShowScanner(false)}
                      variant="outline"
                      className="w-full border-slate-600 text-slate-300"
                      data-testid="button-enter-manually"
                    >
                      Enter Manually
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
              <div className="text-center">
                <p className="text-slate-300 text-sm mb-3">
                  Position the QR code within the frame
                </p>
                <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Scanning...</span>
                </div>
              </div>
            </div>
          </div>
          
          <style>{`
            @keyframes scanLine {
              0%, 100% { transform: translateY(-100px); opacity: 0.3; }
              50% { transform: translateY(100px); opacity: 1; }
            }
          `}</style>
        </DialogContent>
      </Dialog>

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
