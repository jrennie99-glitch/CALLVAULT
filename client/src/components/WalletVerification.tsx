import { useState } from 'react';
import { Wallet, CheckCircle, XCircle, ChevronLeft, Shield, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLocalWalletVerification, saveLocalWalletVerification, clearLocalWalletVerification } from '@/lib/policyStorage';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';
import type { WalletVerification as WalletVerificationType, CryptoIdentity } from '@shared/types';
import * as cryptoLib from '@/lib/crypto';

interface WalletVerificationProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack: () => void;
}

export function WalletVerification({ identity, ws, onBack }: WalletVerificationProps) {
  const [verification, setVerification] = useState<WalletVerificationType | null>(getLocalWalletVerification());
  const [walletAddress, setWalletAddress] = useState('');
  const [walletSignature, setWalletSignature] = useState('');
  const [showVerify, setShowVerify] = useState(false);

  const messageToSign = `Link this wallet to my CallVS ID: ${identity.address} at ${Date.now()}`;

  const verifyWallet = async () => {
    if (!walletAddress || !walletSignature) {
      toast.error('Please enter both wallet address and signature');
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }

    const verificationData: WalletVerificationType = {
      call_address: identity.address,
      wallet_address: walletAddress,
      wallet_type: walletAddress.startsWith('0x') ? 'ethereum' : 'solana',
      signature: walletSignature,
      verified_at: Date.now()
    };

    const nonce = cryptoLib.generateNonce();
    const timestamp = Date.now();
    const payload = { verification: verificationData, nonce, timestamp };
    const signature = cryptoLib.signPayload(identity.secretKey, payload);

    const handleResponse = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'wallet:verified') {
          saveLocalWalletVerification(msg.verification);
          setVerification(msg.verification);
          setShowVerify(false);
          toast.success('Wallet verified! Your profile now shows a verified badge.');
          ws.removeEventListener('message', handleResponse);
        } else if (msg.type === 'error') {
          toast.error(msg.message);
          ws.removeEventListener('message', handleResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener('message', handleResponse);
    ws.send(JSON.stringify({
      type: 'wallet:verify',
      verification: verificationData,
      signature,
      from_pubkey: identity.publicKeyBase58,
      nonce,
      timestamp
    }));
  };

  const removeVerification = () => {
    clearLocalWalletVerification();
    setVerification(null);
    toast.success('Wallet verification removed');
  };

  const copyMessage = () => {
    copyToClipboard(messageToSign, 'Message copied! Sign this in your wallet app.');
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-emerald-400 mb-4"
        data-testid="button-back-wallet"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Wallet Verification
            <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">Optional</span>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Link a crypto wallet to add a verified badge to your profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verification ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-emerald-400 font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Wallet Verified
                  </p>
                  <p className="text-slate-400 text-sm truncate">
                    {verification.wallet_address}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {verification.wallet_type === 'ethereum' ? 'Ethereum' : 'Solana'} wallet
                  </p>
                </div>
              </div>
              <Button
                onClick={removeVerification}
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full"
                data-testid="button-remove-verification"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Remove Verification
              </Button>
            </div>
          ) : showVerify ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Step 1: Copy this message</Label>
                <div className="p-3 bg-slate-900/50 rounded-lg">
                  <p className="text-slate-400 text-sm break-all font-mono">{messageToSign}</p>
                  <Button
                    onClick={copyMessage}
                    size="sm"
                    variant="ghost"
                    className="mt-2 text-emerald-400"
                    data-testid="button-copy-message"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Message
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Step 2: Sign it in your wallet app</Label>
                <p className="text-slate-500 text-xs">
                  Use MetaMask, Phantom, or any wallet that supports message signing
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Step 3: Enter your wallet address</Label>
                <Input
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x... or Solana address"
                  className="bg-slate-900/50 border-slate-600 text-white font-mono"
                  data-testid="input-wallet-address"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Step 4: Paste the signature</Label>
                <Input
                  value={walletSignature}
                  onChange={(e) => setWalletSignature(e.target.value)}
                  placeholder="Signature from your wallet"
                  className="bg-slate-900/50 border-slate-600 text-white font-mono"
                  data-testid="input-wallet-signature"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setShowVerify(false)}
                  variant="ghost"
                  className="flex-1 text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  onClick={verifyWallet}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                  data-testid="button-submit-verification"
                >
                  Verify Wallet
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 mb-4">
                Adding a verified wallet helps others trust your identity
              </p>
              <Button
                onClick={() => setShowVerify(true)}
                className="bg-emerald-500 hover:bg-emerald-600"
                data-testid="button-start-verification"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Verify a Wallet
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-4">
          <p className="text-slate-500 text-sm">
            <strong className="text-slate-400">Note:</strong> Wallet verification is completely optional.
            You don't need a crypto wallet to use this app. This feature just adds an extra trust signal
            for users who want to prove they own a wallet address.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
