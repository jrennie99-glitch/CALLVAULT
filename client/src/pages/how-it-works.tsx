import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Shield, Snowflake, Link2, UserCheck, Volume2, 
  ArrowRight, ArrowLeft, AlertCircle
} from 'lucide-react';

export default function HowItWorksPage() {
  const [, setLocation] = useLocation();

  const steps = [
    {
      icon: Snowflake,
      iconColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500/20',
      title: 'Turn on Freeze Mode',
      description: 'Only approved contacts can notify you; unknown callers must request access.'
    },
    {
      icon: Link2,
      iconColor: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      title: 'Stop sharing your phone number',
      description: 'Share an invite link or approval request instead.'
    },
    {
      icon: UserCheck,
      iconColor: 'text-green-400',
      bgColor: 'bg-green-500/20',
      title: 'Approve who can reach you',
      description: 'No approval = no ring.'
    },
    {
      icon: Volume2,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      title: 'Enjoy the silence',
      description: 'Spam never reaches you inside the service.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="px-4 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <button 
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          data-testid="link-back-home"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold">Crypto Call</span>
        </div>
        <Button onClick={() => setLocation('/onboarding')} data-testid="button-get-started">
          Get Started
        </Button>
      </header>

      <main className="px-4 py-12 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
            How It Works
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            This is a web-based communication layer designed to reduce spam and protect privacy by minimizing reliance on phone numbers.
          </p>
        </div>

        <div className="space-y-8 mb-16">
          {steps.map((step, index) => (
            <Card key={index} className="bg-slate-800/50 border-slate-700 backdrop-blur overflow-hidden">
              <CardContent className="p-6 flex items-start gap-6">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold text-white mb-3">
                    {index + 1}
                  </div>
                  <div className={`w-14 h-14 rounded-xl ${step.bgColor} flex items-center justify-center`}>
                    <step.icon className={`w-7 h-7 ${step.iconColor}`} />
                  </div>
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="text-xl font-semibold mb-2 text-white">{step.title}</h3>
                  <p className="text-slate-400 text-lg">{step.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-amber-500/10 border-amber-500/30 mb-16">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-amber-300 mb-2">Important Note</h4>
              <p className="text-slate-300">
                This service does not intercept carrier phone calls or SMS. Many users keep their phone on Do Not Disturb and use this as their intentional call channel.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to take control?</h2>
          <p className="text-slate-400 mb-8">Start free and experience spam-free communication.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
              onClick={() => setLocation('/onboarding')}
              data-testid="button-get-started-bottom"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 px-8 text-lg border-slate-600 hover:bg-slate-800"
              onClick={() => setLocation('/faq')}
              data-testid="link-faq"
            >
              Read FAQ
            </Button>
          </div>
        </div>
      </main>

      <footer className="px-4 py-8 text-center text-slate-500 text-sm border-t border-slate-800">
        <p>This is a web-based communication service. It does not intercept carrier calls/SMS.</p>
      </footer>
    </div>
  );
}
