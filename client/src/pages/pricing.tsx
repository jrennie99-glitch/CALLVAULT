import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Check, X, ArrowLeft, Sparkles, 
  Video, Lock, Users, Zap, Crown, Snowflake, AlertCircle, Loader2
} from 'lucide-react';
import { PLATFORM } from '@/lib/platform';

type PlanFeature = { text: string; included: boolean; limit?: boolean };

type PlanDisplay = {
  name: string;
  price: string;
  period: string;
  description: string;
  badge: string | null;
  note: string | null;
  features: PlanFeature[];
  cta: string;
  ctaVariant: 'outline' | 'default';
  popular: boolean;
  purchaseMethod: string;
  productId?: string;
};

const planFeatures: Record<string, { features: PlanFeature[]; description: string; note: string | null }> = {
  free: {
    description: 'Privacy & spam protection',
    note: 'Outbound limits apply',
    features: [
      { text: 'Unlimited incoming calls', included: true },
      { text: 'End-to-end encrypted calls', included: true },
      { text: 'Cryptographic identity', included: true },
      { text: 'Contact allowlist (approved callers)', included: true },
      { text: 'Freeze Mode (silence unwanted calls)', included: true },
      { text: '5 outbound calls per day', included: true, limit: true },
      { text: '15 min max per call', included: true, limit: true },
      { text: '1 call at a time', included: true, limit: true },
      { text: 'Call scheduling', included: false },
      { text: 'Paid call links', included: false },
      { text: 'Public profile', included: false },
    ],
  },
  pro: {
    description: 'For creators who monetize their time',
    note: null,
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Unlimited outbound calls', included: true },
      { text: 'Unlimited call duration', included: true },
      { text: 'Unlimited daily calls', included: true },
      { text: 'Call scheduling', included: true },
      { text: 'Availability controls', included: true },
      { text: 'Paid call links (monetize time)', included: true },
      { text: 'Creator mode', included: true },
      { text: 'Higher call priority', included: true },
      { text: 'Public profile page', included: false },
      { text: 'Call queue management', included: false },
    ],
  },
  business: {
    description: 'Full business features for professionals',
    note: null,
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Public profile page', included: true },
      { text: 'Call queue management', included: true },
      { text: 'Earnings dashboard', included: true },
      { text: 'Business mode', included: true },
      { text: 'Priority routing', included: true },
      { text: 'Custom branding', included: true },
      { text: 'Admin controls', included: true },
      { text: 'Priority support', included: true },
      { text: 'Future team/assistant support', included: true },
    ],
  },
};

function formatPrice(cents: number): string {
  if (cents === 0) return '$0';
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

function getPurchaseMethodLabel(method: string): string {
  switch (method) {
    case 'google_play': return 'via Google Play';
    case 'apple_iap': return 'via App Store';
    case 'stripe': return '';
    default: return '';
  }
}

export default function PricingPage() {
  const [, setLocation] = useLocation();
  
  const { data: pricingData, isLoading } = useQuery({
    queryKey: ['billing-plans', PLATFORM],
    queryFn: async () => {
      const response = await fetch(`/api/billing/plans?platform=${PLATFORM}`);
      if (!response.ok) throw new Error('Failed to fetch plans');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  const plans: PlanDisplay[] = (pricingData?.plans || []).map((plan: any) => {
    const meta = planFeatures[plan.id] || { features: [], description: '', note: null };
    return {
      name: plan.name,
      price: formatPrice(plan.price),
      period: plan.id === 'free' ? 'forever' : '/month',
      description: meta.description,
      badge: plan.id === 'pro' ? 'Most Popular' : null,
      note: meta.note,
      features: meta.features,
      cta: plan.id === 'free' ? 'Get Started' : 'Start Free Trial',
      ctaVariant: plan.id === 'free' ? 'outline' : 'default',
      popular: plan.id === 'pro',
      purchaseMethod: plan.purchaseMethod,
      productId: plan.productId,
    };
  });
  
  const platformLabel = pricingData?.platform === 'android' 
    ? ' (Android)' 
    : pricingData?.platform === 'ios' 
      ? ' (iOS)' 
      : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="px-4 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <Button variant="ghost" onClick={() => setLocation('/')} data-testid="button-back-home">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold">Call Vault</span>
        </div>
        <Button onClick={() => setLocation('/app')} data-testid="button-open-app-pricing">
          Open App
        </Button>
      </header>

      <main className="px-4 py-12 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
            <Sparkles className="w-3 h-3 mr-1" /> Simple Pricing{platformLabel}
          </Badge>
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-slate-400 max-w-xl mx-auto">
            Start free for privacy protection. Upgrade when you need more.
          </p>
        </div>

        <div className="text-center mb-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-blue-300">
            <Sparkles className="w-4 h-4 inline mr-2" />
            Try Pro or Business free for 7 days
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {plans.map((plan) => (
              <Card 
                key={plan.name}
                className={`bg-slate-800/50 border-slate-700 backdrop-blur relative ${
                  plan.popular ? 'ring-2 ring-purple-500 md:scale-105' : ''
                }`}
              >
                {plan.badge && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500">
                    <Crown className="w-3 h-3 mr-1" />
                    {plan.badge}
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl text-white">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-slate-400">{plan.period}</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-2">{plan.description}</p>
                  {plan.purchaseMethod !== 'none' && plan.purchaseMethod !== 'stripe' && (
                    <p className="text-purple-400/80 text-xs mt-1">
                      {getPurchaseMethodLabel(plan.purchaseMethod)}
                    </p>
                  )}
                  {plan.note && (
                    <p className="text-amber-400/80 text-xs mt-2 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {plan.note}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check className={`w-5 h-5 flex-shrink-0 ${feature.limit ? 'text-amber-400' : 'text-green-400'}`} />
                        ) : (
                          <X className="w-5 h-5 text-slate-600 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${feature.included ? (feature.limit ? 'text-amber-200' : 'text-slate-300') : 'text-slate-500'}`}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full ${
                      plan.popular 
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700' 
                        : ''
                    }`}
                    variant={plan.ctaVariant}
                    onClick={() => setLocation('/app')}
                    data-testid={`button-plan-${plan.name.toLowerCase()}`}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <section className="py-12">
          <h2 className="text-2xl font-bold text-center mb-8">All Plans Include</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Video className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="font-semibold mb-1">HD Video Calls</h4>
              <p className="text-slate-400 text-sm">Crystal clear WebRTC</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="font-semibold mb-1">End-to-End Encryption</h4>
              <p className="text-slate-400 text-sm">Your calls stay private</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                <Snowflake className="w-6 h-6 text-cyan-400" />
              </div>
              <h4 className="font-semibold mb-1">Freeze Mode</h4>
              <p className="text-slate-400 text-sm">Silence unwanted calls</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <h4 className="font-semibold mb-1">No Phone Number</h4>
              <p className="text-slate-400 text-sm">Privacy by design</p>
            </div>
          </div>
        </section>

        <section className="py-12 border-t border-slate-700">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Why These Tiers?</h2>
            <div className="space-y-4 text-left">
              <div className="bg-slate-800/30 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Free: Privacy Protection</h4>
                <p className="text-slate-400 text-sm">
                  Free accounts are designed for privacy and spam protection. Unlimited incoming calls, but outbound limits prevent abuse. Perfect for receiving calls without giving out your phone number.
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Pro: Power Users & Creators</h4>
                <p className="text-slate-400 text-sm">
                  Remove all limits and unlock monetization features. Paid call links let you charge for your time. No per-minute fees—just a flat $9/month.
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Business: Full Control</h4>
                <p className="text-slate-400 text-sm">
                  Public profiles, call queues, earnings dashboards, and admin controls. Built for professionals who need to manage their availability and revenue.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-slate-400 mb-8">
            Start free, upgrade anytime. No credit card required for free plan.
          </p>
          <Button 
            size="lg" 
            className="h-14 px-8 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            onClick={() => setLocation('/app')}
            data-testid="button-cta-bottom"
          >
            Open App
          </Button>
        </section>
      </main>

      <footer className="px-4 py-8 border-t border-slate-800 text-center text-sm text-slate-500">
        <p>Billing powered by Stripe. Cancel anytime.</p>
      </footer>
    </div>
  );
}
