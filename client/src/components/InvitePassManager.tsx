import { useState, useEffect } from 'react';
import { Ticket, Plus, Clock, Hash, Trash2, Copy, Share2, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLocalPasses, saveLocalPass, removeLocalPass, formatPassExpiry, getPassShareUrl } from '@/lib/policyStorage';
import { toast } from 'sonner';
import type { CallPass, PassType, CryptoIdentity } from '@shared/types';
import * as cryptoLib from '@/lib/crypto';

interface InvitePassManagerProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack?: () => void;
}

export function InvitePassManager({ identity, ws, onBack }: InvitePassManagerProps) {
  const [passes, setPasses] = useState<CallPass[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [passType, setPassType] = useState<PassType>('one_time');
  const [maxUses, setMaxUses] = useState(3);
  const [expiryMinutes, setExpiryMinutes] = useState(60);

  useEffect(() => {
    loadPasses();
  }, []);

  const loadPasses = () => {
    const storedPasses = getLocalPasses();
    setPasses(storedPasses.filter(p => !p.revoked && !p.burned));
  };

  const createPass = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }

    const passData: Omit<CallPass, 'id' | 'created_at' | 'burned' | 'revoked'> = {
      recipient_address: identity.address,
      created_by: identity.address,
      pass_type: passType,
      uses_remaining: passType === 'limited' ? maxUses : undefined,
      max_uses: passType === 'limited' ? maxUses : undefined,
      expires_at: passType === 'expiring' ? Date.now() + (expiryMinutes * 60 * 1000) : undefined
    };

    const nonce = cryptoLib.generateNonce();
    const timestamp = Date.now();
    const payload = { pass: passData, nonce, timestamp };
    const signature = cryptoLib.signPayload(identity.secretKey, payload);

    const handleResponse = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pass:created') {
          saveLocalPass(msg.pass);
          loadPasses();
          setShowCreate(false);
          toast.success('Invite pass created!');
          ws.removeEventListener('message', handleResponse);
        } else if (msg.type === 'error') {
          toast.error(msg.message);
          ws.removeEventListener('message', handleResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener('message', handleResponse);
    ws.send(JSON.stringify({
      type: 'pass:create',
      pass: passData,
      signature,
      from_pubkey: identity.publicKeyBase58,
      nonce,
      timestamp
    }));
  };

  const revokePass = async (passId: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }

    const nonce = cryptoLib.generateNonce();
    const timestamp = Date.now();
    const payload = { pass_id: passId, from_address: identity.address, nonce, timestamp };
    const signature = cryptoLib.signPayload(identity.secretKey, payload);

    const handleResponse = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pass:revoked') {
          removeLocalPass(passId);
          loadPasses();
          toast.success('Pass revoked');
          ws.removeEventListener('message', handleResponse);
        } else if (msg.type === 'error') {
          toast.error(msg.message);
          ws.removeEventListener('message', handleResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener('message', handleResponse);
    ws.send(JSON.stringify({
      type: 'pass:revoke',
      pass_id: passId,
      signature,
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      nonce,
      timestamp
    }));
  };

  const copyPassLink = (pass: CallPass) => {
    const url = getPassShareUrl(pass.id);
    navigator.clipboard.writeText(url);
    toast.success('Link copied! Share it with anyone you want to allow calling you.');
  };

  const sharePass = async (pass: CallPass) => {
    const url = getPassShareUrl(pass.id);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Call Me',
          text: 'Use this invite to call me on Crypto Call',
          url
        });
      } catch (e) {
        copyPassLink(pass);
      }
    } else {
      copyPassLink(pass);
    }
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-emerald-400 mb-4"
          data-testid="button-back-passes"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
      )}

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                Invite Passes
              </CardTitle>
              <CardDescription className="text-slate-400">
                Let specific people reach you without being in your contacts
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600"
              data-testid="button-create-pass"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          </div>
        </CardHeader>

        {showCreate && (
          <CardContent className="border-t border-slate-700 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Pass Type</Label>
                <Select value={passType} onValueChange={(v) => setPassType(v as PassType)}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white" data-testid="select-pass-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="one_time" className="text-white">One-time use</SelectItem>
                    <SelectItem value="expiring" className="text-white">Time-limited</SelectItem>
                    <SelectItem value="limited" className="text-white">Limited uses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {passType === 'limited' && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Number of uses</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxUses}
                    onChange={(e) => setMaxUses(parseInt(e.target.value) || 3)}
                    className="bg-slate-900/50 border-slate-600 text-white"
                    data-testid="input-max-uses"
                  />
                </div>
              )}

              {passType === 'expiring' && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Expires after</Label>
                  <Select value={expiryMinutes.toString()} onValueChange={(v) => setExpiryMinutes(parseInt(v))}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white" data-testid="select-expiry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="15" className="text-white">15 minutes</SelectItem>
                      <SelectItem value="60" className="text-white">1 hour</SelectItem>
                      <SelectItem value="1440" className="text-white">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={createPass} className="w-full bg-emerald-500 hover:bg-emerald-600" data-testid="button-confirm-create-pass">
                Create Invite Pass
              </Button>
            </div>
          </CardContent>
        )}

        {passes.length > 0 && (
          <CardContent className="space-y-3">
            {passes.map((pass) => (
              <div
                key={pass.id}
                className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg"
                data-testid={`pass-item-${pass.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    pass.pass_type === 'one_time' ? 'bg-purple-500/20 text-purple-400' :
                    pass.pass_type === 'expiring' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {pass.pass_type === 'one_time' && <Ticket className="w-5 h-5" />}
                    {pass.pass_type === 'expiring' && <Clock className="w-5 h-5" />}
                    {pass.pass_type === 'limited' && <Hash className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      {pass.pass_type === 'one_time' && 'One-time pass'}
                      {pass.pass_type === 'expiring' && `Expires: ${formatPassExpiry(pass.expires_at!)}`}
                      {pass.pass_type === 'limited' && `${pass.uses_remaining}/${pass.max_uses} uses left`}
                    </p>
                    <p className="text-slate-500 text-xs">
                      Created {new Date(pass.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => sharePass(pass)}
                    size="icon"
                    variant="ghost"
                    className="text-slate-400 hover:text-white"
                    data-testid={`button-share-pass-${pass.id}`}
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => copyPassLink(pass)}
                    size="icon"
                    variant="ghost"
                    className="text-slate-400 hover:text-white"
                    data-testid={`button-copy-pass-${pass.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => revokePass(pass.id)}
                    size="icon"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    data-testid={`button-revoke-pass-${pass.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        )}

        {passes.length === 0 && !showCreate && (
          <CardContent>
            <p className="text-center text-slate-500 py-4">
              No active invite passes. Create one to let someone call you.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
