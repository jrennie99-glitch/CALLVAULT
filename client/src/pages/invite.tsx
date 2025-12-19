import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gift, Check, Clock, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface InviteLinkInfo {
  code: string;
  type: string;
  trialDays: number | null;
  trialMinutes: number | null;
  grantPlan: string | null;
  isValid: boolean;
}

export default function InvitePage() {
  const [, params] = useRoute('/invite/:code');
  const [, setLocation] = useLocation();
  const code = params?.code || '';
  const [isRedeeming, setIsRedeeming] = useState(false);

  const { data: inviteInfo, isLoading, error } = useQuery<InviteLinkInfo>({
    queryKey: ['invite-link', code],
    queryFn: async () => {
      const res = await fetch(`/api/invite/${code}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Invalid invite link');
      }
      return res.json();
    },
    enabled: !!code,
    retry: false,
  });

  const redeemMutation = useMutation({
    mutationFn: async (redeemerAddress: string) => {
      const res = await fetch(`/api/invite/${code}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redeemerAddress }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to redeem invite');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Welcome! You now have ${data.trialDays} days + ${data.trialMinutes} minutes of ${data.grantPlan} access`);
      setTimeout(() => setLocation('/'), 1500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setIsRedeeming(false);
    },
  });

  const handleRedeem = () => {
    const storedIdentity = localStorage.getItem('crypto_identity');
    if (!storedIdentity) {
      toast.error('Please open the app first to create your identity, then return to this link');
      return;
    }
    
    try {
      const identity = JSON.parse(storedIdentity);
      setIsRedeeming(true);
      redeemMutation.mutate(identity.address);
    } catch {
      toast.error('Invalid identity. Please open the app first.');
    }
  };

  const getPlanColor = (plan: string | null) => {
    switch (plan) {
      case 'business': return 'bg-orange-500';
      case 'pro': return 'bg-purple-500';
      default: return 'bg-blue-500';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Invalid Invite</h1>
            <p className="text-slate-400 mb-6">
              {(error as Error)?.message || 'This invite link is no longer valid or has expired.'}
            </p>
            <Button onClick={() => setLocation('/')} data-testid="button-go-home">
              Go to Crypto Call
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl text-white">You're Invited!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-slate-300 text-center">
            Someone special has invited you to try Crypto Call with a free trial.
          </p>

          <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Plan Access</span>
              <Badge className={`${getPlanColor(inviteInfo.grantPlan)} capitalize`}>
                <Sparkles className="w-3 h-3 mr-1" />
                {inviteInfo.grantPlan || 'Pro'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Trial Duration</span>
              <span className="text-white font-medium">
                <Clock className="w-4 h-4 inline mr-1" />
                {inviteInfo.trialDays} days
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Call Minutes</span>
              <span className="text-white font-medium">
                {inviteInfo.trialMinutes} minutes
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">Secure end-to-end encrypted calls</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">No phone number or email required</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">Private cryptographic identity</span>
            </div>
          </div>

          <Button 
            onClick={handleRedeem}
            disabled={isRedeeming || redeemMutation.isPending}
            className="w-full h-12 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            data-testid="button-redeem-invite"
          >
            {isRedeeming || redeemMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Claim Your Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            By claiming, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
