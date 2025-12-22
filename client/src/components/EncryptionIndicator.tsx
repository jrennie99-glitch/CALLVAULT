import { Shield, Lock } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface EncryptionIndicatorProps {
  type: 'call' | 'message';
  className?: string;
  showLabel?: boolean;
}

export function EncryptionIndicator({ type, className = '', showLabel = true }: EncryptionIndicatorProps) {
  if (!isFeatureEnabled('E2E_ENCRYPTION_INDICATOR')) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`} data-testid={`encryption-indicator-${type}`}>
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20">
        <Lock className="w-3 h-3 text-emerald-400" />
      </div>
      {showLabel && (
        <span className="text-xs text-emerald-400/80">
          End-to-end encrypted
        </span>
      )}
    </div>
  );
}

export function EncryptionBadge({ className = '' }: { className?: string }) {
  if (!isFeatureEnabled('E2E_ENCRYPTION_INDICATOR')) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 ${className}`} data-testid="encryption-badge">
      <Shield className="w-3 h-3 text-emerald-400" />
      <span className="text-[10px] font-medium text-emerald-400">E2E</span>
    </div>
  );
}
