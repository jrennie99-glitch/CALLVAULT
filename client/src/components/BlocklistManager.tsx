import { useState, useEffect } from 'react';
import { Ban, Trash2, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLocalBlocklist, removeFromLocalBlocklist } from '@/lib/policyStorage';
import { getContactByAddress } from '@/lib/storage';
import { Avatar } from '@/components/Avatar';
import { toast } from 'sonner';
import type { BlockedUser, CryptoIdentity } from '@shared/types';
import * as cryptoLib from '@/lib/crypto';

interface BlocklistManagerProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack: () => void;
}

export function BlocklistManager({ identity, ws, onBack }: BlocklistManagerProps) {
  const [blocklist, setBlocklist] = useState<BlockedUser[]>([]);

  useEffect(() => {
    setBlocklist(getLocalBlocklist());
  }, []);

  const unblockUser = async (blockedAddress: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }

    const nonce = cryptoLib.generateNonce();
    const timestamp = Date.now();
    const payload = { blocked_address: blockedAddress, from_address: identity.address, nonce, timestamp };
    const signature = cryptoLib.signPayload(identity.secretKey, payload);

    const handleResponse = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'block:removed') {
          removeFromLocalBlocklist(blockedAddress);
          setBlocklist(getLocalBlocklist());
          toast.success('User unblocked');
          ws.removeEventListener('message', handleResponse);
        } else if (msg.type === 'error') {
          toast.error(msg.message);
          ws.removeEventListener('message', handleResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener('message', handleResponse);
    ws.send(JSON.stringify({
      type: 'block:remove',
      blocked_address: blockedAddress,
      signature,
      from_pubkey: identity.publicKeyBase58,
      from_address: identity.address,
      nonce,
      timestamp
    }));
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-emerald-400 mb-4"
        data-testid="button-back-blocklist"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      {blocklist.length > 0 && (
        <div className="p-4 bg-slate-800/30 rounded-xl mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <Ban className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-white font-medium">{blocklist.length} blocked {blocklist.length === 1 ? 'user' : 'users'}</p>
            <p className="text-slate-500 text-sm">These people can't reach you</p>
          </div>
        </div>
      )}

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Blocked Users
          </CardTitle>
          <CardDescription className="text-slate-400">
            These people cannot call or message you
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blocklist.length === 0 ? (
            <div className="text-center py-8">
              <Ban className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">No blocked users</p>
              <p className="text-slate-600 text-sm mt-1">
                Block users from the contact screen or incoming calls
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {blocklist.map((blocked) => {
                const contact = getContactByAddress(blocked.blocked_address);
                return (
                  <div
                    key={blocked.blocked_address}
                    className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg"
                    data-testid={`blocked-item-${blocked.blocked_address}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={contact?.name || 'Unknown'}
                        address={blocked.blocked_address}
                        size="sm"
                      />
                      <div>
                        <p className="text-white font-medium">
                          {contact?.name || 'Not in your contacts'}
                        </p>
                        <p className="text-slate-500 text-xs truncate max-w-[180px]">
                          {blocked.blocked_address}
                        </p>
                        {blocked.reason && (
                          <p className="text-orange-400 text-xs flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3" />
                            {blocked.reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => unblockUser(blocked.blocked_address)}
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-white"
                      data-testid={`button-unblock-${blocked.blocked_address}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Unblock
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
