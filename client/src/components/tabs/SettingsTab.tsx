import { useState, useEffect } from 'react';
import { User, Shield, Wifi, ChevronDown, ChevronUp, Copy, RefreshCw, Fingerprint, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getUserProfile, saveUserProfile, getAppSettings, saveAppSettings } from '@/lib/storage';
import { enrollBiometric, disableBiometric, isPlatformAuthenticatorAvailable } from '@/lib/biometric';
import { toast } from 'sonner';
import type { CryptoIdentity } from '@shared/types';

interface SettingsTabProps {
  identity: CryptoIdentity | null;
  onRotateAddress: () => void;
  turnEnabled: boolean;
}

export function SettingsTab({ identity, onRotateAddress, turnEnabled }: SettingsTabProps) {
  const [profile, setProfile] = useState(getUserProfile());
  const [settings, setSettings] = useState(getAppSettings());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
  }, []);

  const updateProfile = (updates: Partial<typeof profile>) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    saveUserProfile(newProfile);
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      setIsEnrolling(true);
      try {
        await enrollBiometric();
        const newSettings = { ...settings, biometricLockEnabled: true };
        setSettings(newSettings);
        saveAppSettings(newSettings);
        toast.success('Biometric lock enabled');
      } catch (error: any) {
        toast.error(error.message || 'Failed to enable biometric lock');
      } finally {
        setIsEnrolling(false);
      }
    } else {
      await disableBiometric();
      const newSettings = { ...settings, biometricLockEnabled: false };
      setSettings(newSettings);
      saveAppSettings(newSettings);
      toast.success('Biometric lock disabled');
    }
  };

  const copyAddress = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.address);
      toast.success('Address copied!');
    }
  };

  const copyPublicKey = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.publicKeyBase58);
      toast.success('Public key copied!');
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Display Name</Label>
            <Input
              value={profile.displayName}
              onChange={(e) => updateProfile({ displayName: e.target.value })}
              className="mt-1 bg-slate-900/50 border-slate-600 text-white"
              data-testid="input-display-name"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Privacy & Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Biometric Lock</p>
                <p className="text-slate-500 text-sm">
                  {biometricAvailable ? 'Use Face ID or Touch ID' : 'Not available on this device'}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.biometricLockEnabled}
              onCheckedChange={handleBiometricToggle}
              disabled={!biometricAvailable || isEnrolling}
              data-testid="switch-biometric"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.hideAdvancedByDefault ? (
                <EyeOff className="w-5 h-5 text-slate-400" />
              ) : (
                <Eye className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <p className="text-white font-medium">Hide Advanced Info</p>
                <p className="text-slate-500 text-sm">Public key and address hidden by default</p>
              </div>
            </div>
            <Switch
              checked={settings.hideAdvancedByDefault}
              onCheckedChange={(checked) => {
                const newSettings = { ...settings, hideAdvancedByDefault: checked };
                setSettings(newSettings);
                saveAppSettings(newSettings);
              }}
              data-testid="switch-hide-advanced"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Network
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">ICE Mode</p>
              <p className="text-slate-500 text-sm">
                {turnEnabled ? 'TURN + STUN (Full NAT Support)' : 'STUN Only'}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${turnEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
              {turnEnabled ? 'Enhanced' : 'Basic'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between"
          >
            <CardTitle className="text-white">Advanced Identity</CardTitle>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {!showAdvanced && (
            <CardDescription className="text-slate-500">
              View your identity and security details
            </CardDescription>
          )}
        </CardHeader>
        {showAdvanced && identity && (
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-400 text-sm">Public Key</Label>
              <div className="mt-1 p-3 bg-slate-900/50 rounded-lg font-mono text-xs text-slate-300 break-all">
                {identity.publicKeyBase58}
              </div>
              <Button
                onClick={copyPublicKey}
                variant="ghost"
                size="sm"
                className="mt-2 text-slate-400 hover:text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Public Key
              </Button>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Call ID</Label>
              <div className="mt-1 p-3 bg-slate-900/50 rounded-lg font-mono text-xs text-emerald-400 break-all" data-testid="text-call-address">
                {identity.address}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={copyAddress}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                  data-testid="button-copy-address"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Call ID
                </Button>
                <Button
                  onClick={onRotateAddress}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                  data-testid="button-rotate-address"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Address
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm italic">
            "Calls only happen with your permission."
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Crypto Call uses end-to-end encryption for secure peer-to-peer calling.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
