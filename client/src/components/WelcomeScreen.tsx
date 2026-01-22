import { useState, useEffect } from 'react';
import { Cloud, Plus, ArrowRight, Eye, EyeOff, Shield, Smartphone, Key, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { decryptIdentityFromVault, saveIdentity, generateIdentity, signPayload, generateNonce, recoverIdentityFromPrivateKey } from '@/lib/crypto';
import { syncContactsFromServer } from '@/lib/storage';
import { toast } from 'sonner';
import type { CryptoIdentity } from '@shared/types';

interface WelcomeScreenProps {
  onIdentityCreated: (identity: CryptoIdentity) => void;
}

const REMEMBERED_KEY_STORAGE = 'cv_remembered_pubkey';

export function WelcomeScreen({ onIdentityCreated }: WelcomeScreenProps) {
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [publicKeyInput, setPublicKeyInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [vaultData, setVaultData] = useState<{
    encryptedKeypair: string;
    salt: string;
    hint: string | null;
  } | null>(null);
  const [step, setStep] = useState<'choose_method' | 'enter_key' | 'enter_pin' | 'enter_private_key'>('choose_method');
  const [rememberedKey, setRememberedKey] = useState<string | null>(null);
  const [rememberThisDevice, setRememberThisDevice] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBERED_KEY_STORAGE);
    if (saved) {
      setRememberedKey(saved);
    }
  }, []);

  const handleCreateNew = () => {
    const newIdentity = generateIdentity();
    saveIdentity(newIdentity);
    onIdentityCreated(newIdentity);
  };

  const handleQuickLogin = async () => {
    if (!rememberedKey) return;
    
    setIsRecovering(true);
    try {
      const res = await fetch(`/api/identity/vault/${encodeURIComponent(rememberedKey)}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('No cloud backup found. Account may have been deleted.');
          localStorage.removeItem(REMEMBERED_KEY_STORAGE);
          setRememberedKey(null);
        } else {
          toast.error('Failed to check cloud backup');
        }
        return;
      }

      const data = await res.json();
      setVaultData(data);
      setPublicKeyInput(rememberedKey);
      setStep('enter_pin');
      setShowRecoveryDialog(true);
    } catch (error) {
      console.error('Failed to check vault:', error);
      toast.error('Failed to connect to server');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleCheckVault = async () => {
    if (!publicKeyInput.trim()) {
      toast.error('Please enter your public key');
      return;
    }

    setIsRecovering(true);
    try {
      const res = await fetch(`/api/identity/vault/${encodeURIComponent(publicKeyInput.trim())}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('No cloud backup found for this public key');
        } else {
          toast.error('Failed to check cloud backup');
        }
        return;
      }

      const data = await res.json();
      setVaultData(data);
      setStep('enter_pin');
    } catch (error) {
      console.error('Failed to check vault:', error);
      toast.error('Failed to connect to server');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRecover = async () => {
    if (!vaultData || !pinInput) {
      toast.error('Please enter your PIN');
      return;
    }

    setIsRecovering(true);
    try {
      const identity = await decryptIdentityFromVault(
        vaultData.encryptedKeypair,
        vaultData.salt,
        pinInput
      );

      if (!identity) {
        toast.error('Incorrect PIN. Please try again.');
        setIsRecovering(false);
        return;
      }

      saveIdentity(identity);
      
      if (rememberThisDevice) {
        localStorage.setItem(REMEMBERED_KEY_STORAGE, identity.publicKeyBase58);
        
        try {
          const nonce = generateNonce();
          const timestamp = Date.now();
          const payload = { action: 'trust_device', publicKeyBase58: identity.publicKeyBase58, nonce, timestamp };
          const signature = signPayload(identity.secretKey, payload);
          
          await fetch('/api/devices/trust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              publicKeyBase58: identity.publicKeyBase58,
              signature,
              nonce,
              timestamp
            })
          });
        } catch (e) {
          console.log('Failed to register trusted device, continuing anyway');
        }
      }

      // Sync contacts from server after cloud backup recovery
      try {
        const syncResult = await syncContactsFromServer(identity.address);
        if (syncResult.imported > 0) {
          toast.success(`Welcome back! Synced ${syncResult.imported} contacts.`);
        } else {
          toast.success('Welcome back!');
        }
      } catch (syncError) {
        console.error('Failed to sync contacts:', syncError);
        toast.success('Welcome back!');
      }

      onIdentityCreated(identity);
    } catch (error) {
      console.error('Failed to decrypt identity:', error);
      toast.error('Failed to restore identity. Check your PIN.');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRecoverFromPrivateKey = async () => {
    if (!privateKeyInput.trim()) {
      toast.error('Please enter your private key');
      return;
    }

    setIsRecovering(true);
    try {
      const identity = recoverIdentityFromPrivateKey(privateKeyInput.trim());
      
      if (!identity) {
        toast.error('Invalid private key. Make sure you copied the full key.');
        setIsRecovering(false);
        return;
      }

      if (rememberThisDevice) {
        localStorage.setItem(REMEMBERED_KEY_STORAGE, identity.publicKeyBase58);
        
        try {
          const nonce = generateNonce();
          const timestamp = Date.now();
          const payload = { action: 'trust_device', publicKeyBase58: identity.publicKeyBase58, nonce, timestamp };
          const signature = signPayload(identity.secretKey, payload);
          
          fetch('/api/devices/trust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              publicKeyBase58: identity.publicKeyBase58,
              signature,
              nonce,
              timestamp
            })
          }).catch(() => {});
        } catch (e) {
          console.log('Failed to register trusted device, continuing anyway');
        }
      }

      // Sync contacts from server after identity recovery
      try {
        const syncResult = await syncContactsFromServer(identity.address);
        if (syncResult.imported > 0) {
          toast.success(`Identity restored! Synced ${syncResult.imported} contacts.`);
        } else if (syncResult.total > 0) {
          toast.success('Identity restored! Contacts already synced.');
        } else {
          toast.success('Identity restored from private key!');
        }
      } catch (syncError) {
        console.error('Failed to sync contacts:', syncError);
        toast.success('Identity restored from private key!');
      }

      onIdentityCreated(identity);
    } catch (error) {
      console.error('Failed to recover from private key:', error);
      toast.error('Failed to restore identity. Check your private key.');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleForgetDevice = () => {
    localStorage.removeItem(REMEMBERED_KEY_STORAGE);
    setRememberedKey(null);
    toast.success('Device forgotten');
  };

  const resetRecovery = () => {
    setShowRecoveryDialog(false);
    setPublicKeyInput('');
    setPrivateKeyInput('');
    setPinInput('');
    setVaultData(null);
    setStep('choose_method');
    setShowPin(false);
    setShowPrivateKey(false);
  };

  const truncateKey = (key: string) => {
    if (key.length <= 12) return key;
    return `${key.slice(0, 6)}...${key.slice(-6)}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Call Vault</h1>
          <p className="text-slate-400">Secure peer-to-peer calling</p>
        </div>

        <div className="space-y-4">
          {rememberedKey && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-slate-300">Remembered Account</span>
                </div>
                <button
                  onClick={handleForgetDevice}
                  className="text-slate-500 hover:text-slate-300 p-1"
                  title="Forget this device"
                  data-testid="button-forget-device"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 font-mono mb-3">{truncateKey(rememberedKey)}</p>
              <Button
                onClick={handleQuickLogin}
                disabled={isRecovering}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                data-testid="button-quick-login"
              >
                {isRecovering ? 'Loading...' : 'Continue with PIN'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          <Button
            onClick={handleCreateNew}
            className="w-full h-14 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white text-lg font-medium"
            data-testid="button-create-new-identity"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create New Identity
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500">or</span>
            </div>
          </div>

          <Button
            onClick={() => setShowRecoveryDialog(true)}
            variant="outline"
            className="w-full h-14 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white text-lg"
            data-testid="button-restore-from-cloud"
          >
            <Key className="w-5 h-5 mr-2" />
            {rememberedKey ? 'Use Different Account' : 'Restore Identity'}
          </Button>
        </div>

        <p className="text-center text-slate-500 text-sm">
          Your identity is generated locally and never leaves your device unencrypted.
        </p>
      </div>

      <Dialog open={showRecoveryDialog} onOpenChange={(open) => !open && resetRecovery()}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-cyan-400" />
              Restore Identity
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {step === 'choose_method' && 'Choose how to restore your identity.'}
              {step === 'enter_key' && 'Enter your public key to find your cloud backup.'}
              {step === 'enter_pin' && 'Enter your PIN to decrypt your identity.'}
              {step === 'enter_private_key' && 'Enter your private key to restore your identity directly.'}
            </DialogDescription>
          </DialogHeader>
          
          {step === 'choose_method' && (
            <div className="space-y-4 mt-4">
              <Tabs defaultValue="cloud" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
                  <TabsTrigger value="cloud" className="data-[state=active]:bg-cyan-500">
                    <Cloud className="w-4 h-4 mr-2" />
                    Cloud Backup
                  </TabsTrigger>
                  <TabsTrigger value="private" className="data-[state=active]:bg-amber-500">
                    <Lock className="w-4 h-4 mr-2" />
                    Private Key
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="cloud" className="mt-4 space-y-4">
                  <p className="text-sm text-slate-400">
                    Restore using your public key and PIN. Your encrypted backup is stored securely in the cloud.
                  </p>
                  <Button 
                    className="w-full bg-cyan-500 hover:bg-cyan-600"
                    onClick={() => setStep('enter_key')}
                    data-testid="button-restore-cloud-method"
                  >
                    Continue with Cloud Backup
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </TabsContent>
                <TabsContent value="private" className="mt-4 space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-sm text-amber-200">
                      <strong>Advanced:</strong> Your private key gives full access to your identity. Only use this if you have your private key backup.
                    </p>
                  </div>
                  <Button 
                    className="w-full bg-amber-500 hover:bg-amber-600"
                    onClick={() => setStep('enter_private_key')}
                    data-testid="button-restore-privatekey-method"
                  >
                    Continue with Private Key
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </TabsContent>
              </Tabs>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={resetRecovery}
                data-testid="button-cancel-recovery"
              >
                Cancel
              </Button>
            </div>
          )}

          {step === 'enter_key' && (
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-slate-300 text-sm">Public Key</Label>
                <Input
                  type="text"
                  value={publicKeyInput}
                  onChange={(e) => setPublicKeyInput(e.target.value)}
                  placeholder="Enter your public key (base58)"
                  className="mt-1 bg-slate-900/50 border-slate-600 text-white font-mono text-sm"
                  data-testid="input-recovery-public-key"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Find your public key in Settings on your other device.
                </p>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setStep('choose_method')}
                  data-testid="button-back-to-methods"
                >
                  Back
                </Button>
                <Button 
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                  onClick={handleCheckVault}
                  disabled={isRecovering || !publicKeyInput.trim()}
                  data-testid="button-check-vault"
                >
                  {isRecovering ? 'Checking...' : 'Find Backup'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 'enter_pin' && (
            <div className="space-y-4 mt-4">
              {vaultData?.hint && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-300 font-medium">Hint:</span> {vaultData.hint}
                  </p>
                </div>
              )}
              <div>
                <Label className="text-slate-300 text-sm">PIN</Label>
                <div className="relative">
                  <Input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter your PIN"
                    className="mt-1 bg-slate-900/50 border-slate-600 text-white pr-10"
                    data-testid="input-recovery-pin"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberThisDevice}
                  onChange={(e) => setRememberThisDevice(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-400">Remember this device</span>
              </label>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setStep('enter_key')}
                  data-testid="button-back-to-key"
                >
                  Back
                </Button>
                <Button 
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                  onClick={handleRecover}
                  disabled={isRecovering || !pinInput}
                  data-testid="button-restore-identity"
                >
                  {isRecovering ? 'Restoring...' : 'Login'}
                </Button>
              </div>
            </div>
          )}

          {step === 'enter_private_key' && (
            <div className="space-y-4 mt-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-200">
                  Your private key is never sent to any server. Recovery happens entirely on your device.
                </p>
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Private Key</Label>
                <div className="relative">
                  <Textarea
                    value={privateKeyInput}
                    onChange={(e) => setPrivateKeyInput(e.target.value)}
                    placeholder="Paste your private key (base58)"
                    className="mt-1 bg-slate-900/50 border-slate-600 text-white font-mono text-xs min-h-[80px] pr-10"
                    data-testid="input-recovery-private-key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Find your private key in Settings → Export Private Key
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberThisDevice}
                  onChange={(e) => setRememberThisDevice(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-400">Remember this device</span>
              </label>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setStep('choose_method')}
                  data-testid="button-back-to-methods-from-private"
                >
                  Back
                </Button>
                <Button 
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                  onClick={handleRecoverFromPrivateKey}
                  disabled={isRecovering || !privateKeyInput.trim()}
                  data-testid="button-restore-from-private-key"
                >
                  {isRecovering ? 'Restoring...' : 'Restore Identity'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
