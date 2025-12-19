import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Lock, Phone, Video, MessageSquare, 
  Zap, Globe, Users, ArrowRight, Check, Sparkles
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
          <span className="text-xl font-bold">Crypto Call</span>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setLocation('/pricing')} data-testid="link-pricing">
            Pricing
          </Button>
          <Button onClick={() => setLocation('/app')} data-testid="button-open-app">
            Open App
          </Button>
        </div>
      </header>

      <main>
        <section className="px-4 py-20 text-center max-w-4xl mx-auto">
          <Badge className="mb-6 bg-blue-500/20 text-blue-300 border-blue-500/30">
            <Sparkles className="w-3 h-3 mr-1" /> End-to-End Encrypted
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">
            Private Calls Without<br />Phone Numbers
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Secure peer-to-peer video and audio calls using cryptographic identity. 
            No accounts, no tracking, no compromises.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              onClick={() => setLocation('/app')}
              data-testid="button-get-started"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 px-8 text-lg border-slate-600 hover:bg-slate-800"
              onClick={() => setLocation('/pricing')}
              data-testid="button-view-pricing"
            >
              View Pricing
            </Button>
          </div>
        </section>

        <section className="px-4 py-16 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">Cryptographic Identity</h3>
                <p className="text-slate-400">
                  Your identity is a cryptographic keypair. No email, phone, or personal info required.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">HD Video & Audio</h3>
                <p className="text-slate-400">
                  Crystal clear peer-to-peer calls with WebRTC. No servers see your media.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">Signature Verified</h3>
                <p className="text-slate-400">
                  Every call is authenticated with Ed25519 signatures. Know exactly who you're talking to.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Crypto Call?</h2>
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
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Works Everywhere</h4>
                  <p className="text-slate-400 text-sm">PWA that works on any device with a browser</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Instant Setup</h4>
                  <p className="text-slate-400 text-sm">Generate your identity and start calling in seconds</p>
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
                  <p className="text-slate-400 text-sm">Paid calls, scheduling, and business hours for pros</p>
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
                  <Check className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Open Source</h4>
                  <p className="text-slate-400 text-sm">Verify our security claims yourself</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready for Private Calls?</h2>
            <p className="text-slate-400 mb-8">
              Join thousands using Crypto Call for secure, private communication.
            </p>
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              onClick={() => setLocation('/app')}
              data-testid="button-cta-bottom"
            >
              Start Calling Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
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
