import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { verifyBiometric, isPlatformAuthenticatorAvailable } from '@/lib/biometric';
import { getAppSettings, saveAppSettings, clearBiometricCredential } from '@/lib/storage';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDisableOption, setShowDisableOption] = useState(false);

  useEffect(() => {
    handleUnlock();
  }, []);

  const handleUnlock = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const available = await isPlatformAuthenticatorAvailable();
      if (!available) {
        setError('Biometric authentication not available');
        return;
      }

      const success = await verifyBiometric();
      if (success) {
        onUnlock();
      } else {
        setError('Verification failed');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Authentication cancelled');
      } else {
        setError(err.message || 'Verification failed');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisableLock = async () => {
    setIsVerifying(true);
    try {
      const success = await verifyBiometric();
      if (success) {
        const settings = getAppSettings();
        settings.biometricLockEnabled = false;
        saveAppSettings(settings);
        clearBiometricCredential();
        onUnlock();
      }
    } catch (err: any) {
      setError('Must verify to disable lock');
    } finally {
      setIsVerifying(false);
      setShowDisableOption(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-8">
          <Lock className="w-12 h-12 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Call Vault</h1>
        <p className="text-slate-400 mb-8">Use Face ID or Touch ID to unlock</p>

        {error && (
          <div className="bg-red-500/20 text-red-400 rounded-xl px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={handleUnlock}
          disabled={isVerifying}
          className="w-full h-14 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-lg font-medium rounded-2xl mb-4"
          data-testid="button-unlock"
        >
          {isVerifying ? (
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 animate-pulse" />
              Verifying...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5" />
              Unlock
            </span>
          )}
        </Button>

        {!showDisableOption ? (
          <button
            onClick={() => setShowDisableOption(true)}
            className="text-slate-500 text-sm hover:text-slate-400"
          >
            Having trouble?
          </button>
        ) : (
          <Button
            onClick={handleDisableLock}
            variant="ghost"
            className="text-slate-400 hover:text-white"
            disabled={isVerifying}
          >
            Disable biometric lock
          </Button>
        )}
      </div>
    </div>
  );
}
