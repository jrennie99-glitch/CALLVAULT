import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Check, X, ArrowLeft, Sparkles, 
  Video, Lock, Users, Zap, Crown
} from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Basic secure calling for everyone',
    badge: null,
    features: [
      { text: 'Unlimited voice & video calls', included: true },
      { text: 'Cryptographic identity', included: true },
      { text: 'End-to-end encryption', included: true },
      { text: 'Contact management', included: true },
      { text: 'Paid call links', included: false },
      { text: 'Business mode', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Get Started',
    ctaVariant: 'outline' as const,
    popular: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'For creators who want to monetize',
    badge: 'Most Popular',
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Paid call links', included: true },
      { text: 'Per-minute billing', included: true },
      { text: 'Call scheduling', included: true },
      { text: 'Custom availability', included: true },
      { text: 'Business mode', included: false },
      { text: 'Team features', included: false },
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'default' as const,
    popular: true,
  },
  {
    name: 'Business',
    price: '$29',
    period: '/month',
    description: 'Full business features for professionals',
    badge: null,
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Business mode', included: true },
      { text: 'Public profile page', included: true },
      { text: 'Call queue management', included: true },
      { text: 'Earnings dashboard', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom branding', included: true },
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'default' as const,
    popular: false,
  },
];

export default function PricingPage() {
  const [, setLocation] = useLocation();

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
          <span className="font-bold">Crypto Call</span>
        </div>
        <Button onClick={() => setLocation('/app')} data-testid="button-open-app-pricing">
          Open App
        </Button>
      </header>

      <main className="px-4 py-12 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
            <Sparkles className="w-3 h-3 mr-1" /> Simple Pricing
          </Badge>
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-slate-400 max-w-xl mx-auto">
            Start free, upgrade when you need more. All plans include our core security features.
          </p>
        </div>

        <div className="text-center mb-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-blue-300">
            <Sparkles className="w-4 h-4 inline mr-2" />
            Try Pro or Business free for 7 days + 30 minutes of calls
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan) => (
            <Card 
              key={plan.name}
              className={`bg-slate-800/50 border-slate-700 backdrop-blur relative ${
                plan.popular ? 'ring-2 ring-purple-500 scale-105' : ''
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
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-slate-400">{plan.period}</span>
                </div>
                <p className="text-slate-400 text-sm mt-2">{plan.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 flex-shrink-0" />
                      )}
                      <span className={feature.included ? 'text-slate-300' : 'text-slate-500'}>
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
              <h4 className="font-semibold mb-1">E2E Encryption</h4>
              <p className="text-slate-400 text-sm">Your calls are private</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <h4 className="font-semibold mb-1">Crypto Identity</h4>
              <p className="text-slate-400 text-sm">No personal info needed</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-6 h-6 text-orange-400" />
              </div>
              <h4 className="font-semibold mb-1">PWA Support</h4>
              <p className="text-slate-400 text-sm">Install on any device</p>
            </div>
          </div>
        </section>

        <section className="py-12 text-center">
          <Card className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/30 max-w-2xl mx-auto">
            <CardContent className="py-8">
              <Users className="w-12 h-12 text-blue-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Need Enterprise Features?</h3>
              <p className="text-slate-400 mb-6">
                For teams and organizations, we offer custom solutions with SSO, 
                advanced analytics, and dedicated support.
              </p>
              <Button variant="outline" className="border-blue-500/50 hover:bg-blue-500/20">
                Contact Sales
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="px-4 py-8 border-t border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="text-slate-400">Crypto Call</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-300">Privacy</a>
            <a href="#" className="hover:text-slate-300">Terms</a>
            <a href="#" className="hover:text-slate-300">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
