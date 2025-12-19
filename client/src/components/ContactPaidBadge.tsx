import { DollarSign, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { getCallPricingSettings, formatPrice } from '@/lib/policyStorage';

type PaidStatus = 'free' | 'paid_required' | 'always_allowed';

interface ContactPaidBadgeProps {
  contactAddress: string;
  recipientAddress: string;
  isFriendsFamily?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function ContactPaidBadge({ 
  contactAddress, 
  recipientAddress, 
  isFriendsFamily = false,
  onClick,
  size = 'sm'
}: ContactPaidBadgeProps) {
  const pricing = getCallPricingSettings();
  
  const getStatus = (): PaidStatus => {
    if (!pricing?.enabled) return 'free';
    if (isFriendsFamily) return 'always_allowed';
    if (pricing.friends_family_addresses?.includes(contactAddress)) return 'always_allowed';
    return 'paid_required';
  };

  const status = getStatus();
  
  const getConfig = () => {
    switch (status) {
      case 'free':
        return {
          icon: CheckCircle,
          label: 'Free',
          bgColor: 'bg-emerald-500/10',
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/20'
        };
      case 'paid_required':
        return {
          icon: DollarSign,
          label: 'Paid',
          bgColor: 'bg-purple-500/10',
          textColor: 'text-purple-400',
          borderColor: 'border-purple-500/20'
        };
      case 'always_allowed':
        return {
          icon: CheckCircle,
          label: 'Always Free',
          bgColor: 'bg-blue-500/10',
          textColor: 'text-blue-400',
          borderColor: 'border-blue-500/20'
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  if (size === 'sm') {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${config.bgColor} ${config.textColor} ${onClick ? 'hover:opacity-80 cursor-pointer' : ''}`}
        data-testid={`badge-paid-status-${status}`}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-lg border ${config.bgColor} ${config.borderColor} ${onClick ? 'hover:opacity-90 cursor-pointer' : ''}`}
      data-testid={`badge-paid-status-${status}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${config.textColor}`} />
        <div className="text-left">
          <p className={`font-medium ${config.textColor}`}>{config.label}</p>
          {status === 'paid_required' && pricing && (
            <p className="text-slate-500 text-xs">
              {pricing.mode === 'per_session' 
                ? `${formatPrice(pricing.session_price_cents || 0)} / session`
                : `${formatPrice(pricing.per_minute_price_cents || 0)} / min`
              }
            </p>
          )}
        </div>
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-400" />}
    </button>
  );
}
