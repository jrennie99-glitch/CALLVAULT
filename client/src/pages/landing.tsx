import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Lock, Phone, Video, MessageSquare, 
  Zap, Globe, Users, ArrowRight, Check, Sparkles,
  Snowflake, UserX, Ban, Clock, HelpCircle
} from 'lucide-react';

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="px-4 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold">Call Vault</span>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/how-it-works')} className="hidden sm:flex" data-testid="link-how-it-works">
            How It Works
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLocation('/faq')} className="hidden sm:flex" data-testid="link-faq">
            FAQ
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLocation('/pricing')} data-testid="link-pricing">
            Pricing
          </Button>
          <Button onClick={() => setLocation('/app')} data-testid="button-open-app">
            Open App
          </Button>
        </div>
      </header>

      <main>
        <section className="px-4 py-16 md:py-24 text-center max-w-4xl mx-auto">
          <Badge className="mb-6 bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
            <Snowflake className="w-3 h-3 mr-1" /> Freeze Mode Available
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
            Freeze Unwanted Calls.<br />Take Back Control.
          </h1>
          <p className="text-xl text-slate-300 mb-4 max-w-2xl mx-auto">
            Communicate without giving away your phone number. Only the people you approve can reach you — spam never interrupts you.
          </p>
          <p className="text-sm text-slate-500 mb-8">
            This is a web-based communication service. It does not intercept carrier calls/SMS.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
              onClick={() => setLocation('/onboarding')}
              data-testid="button-get-started"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 px-8 text-lg border-slate-600 hover:bg-slate-800"
              onClick={() => setLocation('/how-it-works')}
              data-testid="button-learn-more"
            >
              Learn How It Works
            </Button>
          </div>
        </section>

        <section className="px-4 py-16 max-w-4xl mx-auto">
          <Card className="bg-slate-800/30 border-slate-700 backdrop-blur">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-4">
                <UserX className="w-8 h-8 text-red-400" />
                <h2 className="text-2xl font-bold">Why Phone Numbers Failed Us</h2>
              </div>
              <p className="text-slate-300 text-lg">
                Your phone number is permanent. Once it's shared, data brokers resell it — and spam never stops. Blocking is reactive. This service is preventive.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="px-4 py-16 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">Permission-Only Communication</h3>
                <p className="text-slate-400 mb-4">
                  Instead of phone numbers, this service uses approval-based access. If someone isn't approved, they can't even ring you.
                </p>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    No phone number required
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    Approval-only calling
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    No public identifier to sell
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    No robocalls, no spoofing
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-cyan-500/10 border-cyan-500/30 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4">
                  <Snowflake className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">Freeze Mode (Silence by Default)</h3>
                <p className="text-slate-300">
                  Turn on Freeze Mode and keep your phone quiet. Many users keep their phone on Do Not Disturb and use this app as their primary call channel. Only approved people can notify you. Unknown callers must request access.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                  <Ban className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">Privacy Without Data Brokers</h3>
                <p className="text-slate-400">
                  We don't require a phone number. We don't sell user data. We don't create a public identifier. That means there's nothing for data brokers to buy, resell, or leak.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 max-w-4xl mx-auto">
          <Card className="bg-slate-800/30 border-slate-700 backdrop-blur">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold">Your Time, Your Rules</h2>
              </div>
              <p className="text-slate-300 text-lg">
                You decide who can call you, when they can call, and whether approval is required. This is access control for people — not spam filtering.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="px-4 py-16 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Call Vault?</h2>
            <p className="text-slate-400">Built for privacy-conscious individuals and creators</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">No Phone Number</h4>
                  <p className="text-slate-400 text-sm">Share your Call ID instead of personal info</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Video className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">HD Video & Audio</h4>
                  <p className="text-slate-400 text-sm">Crystal clear peer-to-peer calls with WebRTC</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Cryptographic Identity</h4>
                  <p className="text-slate-400 text-sm">Ed25519 signatures verify who you're talking to</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Creator Tools</h4>
                  <p className="text-slate-400 text-sm">Paid calls, scheduling, and business hours</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Encrypted Messages</h4>
                  <p className="text-slate-400 text-sm">Chat securely with your contacts</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Works Everywhere</h4>
                  <p className="text-slate-400 text-sm">PWA that works on any device with a browser</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center bg-gradient-to-b from-transparent to-slate-900/50">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready to freeze unwanted interruptions?</h2>
            <p className="text-slate-400 mb-8">
              Start free, then upgrade for advanced controls when you're ready.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                onClick={() => setLocation('/onboarding')}
                data-testid="button-cta-bottom"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="h-14 px-8 text-lg border-slate-600 hover:bg-slate-800"
                onClick={() => setLocation('/faq')}
                data-testid="button-faq-bottom"
              >
                <HelpCircle className="w-5 h-5 mr-2" />
                Read FAQ
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-8 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-slate-400">Call Vault</span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <button onClick={() => setLocation('/how-it-works')} className="hover:text-slate-300">How It Works</button>
              <button onClick={() => setLocation('/faq')} className="hover:text-slate-300">FAQ</button>
              <button onClick={() => setLocation('/pricing')} className="hover:text-slate-300">Pricing</button>
            </div>
          </div>
          <p className="text-center text-xs text-slate-600">
            This is a web-based communication service. It does not intercept carrier calls/SMS.
          </p>
        </div>
      </footer>
    </div>
  );
}
