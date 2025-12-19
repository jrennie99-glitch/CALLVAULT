import { DollarSign, Phone, Video, AlertCircle, CreditCard, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Avatar';
import { formatPrice } from '@/lib/policyStorage';
import type { CallPricing } from '@shared/types';

interface PaymentRequiredScreenProps {
  recipientAddress: string;
  recipientName?: string;
  pricing: CallPricing;
  isVideo: boolean;
  isTestMode?: boolean;
  onPay: () => void;
  onCancel: () => void;
}

export function PaymentRequiredScreen({ 
  recipientAddress, 
  recipientName, 
  pricing, 
  isVideo, 
  isTestMode = false,
  onPay,
  onCancel
}: PaymentRequiredScreenProps) {
  const displayName = recipientName || recipientAddress.slice(0, 16) + '...';
  
  const getPriceDisplay = () => {
    if (pricing.mode === 'per_session') {
      return {
        amount: formatPrice(pricing.session_price_cents || 0),
        description: `${pricing.session_duration_minutes} minute session`
      };
    }
    return {
      amount: formatPrice(pricing.per_minute_price_cents || 0),
      description: `per minute (min ${pricing.minimum_minutes} min)`
    };
  };

  const priceInfo = getPriceDisplay();

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-4">
            <Avatar address={recipientAddress} size="lg" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
          
          <div className="flex items-center gap-2 mt-2">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-slate-300">This call requires payment</span>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Call type</span>
            <span className="text-white flex items-center gap-2">
              {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              {isVideo ? 'Video' : 'Voice'}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">Price</span>
            <span className="text-white font-medium">{priceInfo.amount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Duration</span>
            <span className="text-slate-300 text-sm">{priceInfo.description}</span>
          </div>
        </div>

        {isTestMode && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-yellow-400 text-sm font-medium">Test Mode</p>
              <p className="text-yellow-400/70 text-xs">No charge — payment is simulated</p>
            </div>
          </div>
        )}

        {pricing.free_first_call && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-sm">First call is free for new contacts!</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1 border-slate-600"
          >
            Cancel
          </Button>
          <Button
            onClick={onPay}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Pay & Call
          </Button>
        </div>
      </div>
    </div>
  );
}
