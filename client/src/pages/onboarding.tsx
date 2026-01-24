import { useState, type ElementType } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Shield, Snowflake, Link2, UserCheck, CheckCircle2,
  ArrowRight, ArrowLeft, Lightbulb, AlertCircle, type LucideIcon
} from 'lucide-react';

interface OnboardingStep {
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  title: string;
  description: string;
  note?: string;
  tip?: string;
}

const steps: OnboardingStep[] = [
  {
    icon: Snowflake,
    iconColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    title: 'Turn on Freeze Mode',
    description: 'Freeze Mode keeps things silent by default. Only approved people can notify you; unknown callers must request access.',
    note: 'This does not change your carrier settings automatically. You stay in control.'
  },
  {
    icon: Link2,
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    title: 'Stop sharing your phone number',
    description: 'Share a private invite link or approval request instead of your number.'
  },
  {
    icon: UserCheck,
    iconColor: 'text-green-400',
    bgColor: 'bg-green-500/20',
    title: 'Approve who can reach you',
    description: 'Choose trusted contacts and decide when you want to be reachable. No approval = no ring.'
  },
  {
    icon: CheckCircle2,
    iconColor: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    title: "You're all set ✅",
    description: 'Your phone is no longer the gatekeeper — you are.',
    tip: 'Many users keep their phone on Do Not Disturb and use this as their intentional call channel.'
  }
];

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];

  const handleNext = () => {
    if (isLastStep) {
      setLocation('/app');
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 0) {
      setLocation('/');
    } else {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      <header className="px-4 py-6 flex items-center justify-between max-w-6xl mx-auto w-full">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{currentStep === 0 ? 'Home' : 'Back'}</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold hidden sm:inline">CallVS</span>
        </div>
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/app')}
          data-testid="button-skip"
        >
          Skip
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Welcome 👋</h1>
            <p className="text-slate-400">Let's freeze unwanted interruptions and make calls intentional.</p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep 
                    ? 'w-8 bg-blue-500' 
                    : index < currentStep 
                      ? 'w-2 bg-blue-500/50' 
                      : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur mb-8">
            <CardContent className="p-8 text-center">
              <div className={`w-20 h-20 rounded-2xl ${step.bgColor} flex items-center justify-center mx-auto mb-6`}>
                <step.icon className={`w-10 h-10 ${step.iconColor}`} />
              </div>
              
              <div className="text-sm text-slate-500 mb-2">Step {currentStep + 1} of {steps.length}</div>
              <h2 className="text-2xl font-bold mb-4 text-white">{step.title}</h2>
              <p className="text-slate-300 text-lg mb-6">{step.description}</p>

              {step.note && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3 text-left mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-200 text-sm">{step.note}</p>
                </div>
              )}

              {step.tip && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3 text-left">
                  <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-blue-200 text-sm">{step.tip}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button 
            size="lg" 
            className={`w-full h-14 text-lg ${
              isLastStep 
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
            }`}
            onClick={handleNext}
            data-testid="button-next"
          >
            {isLastStep ? 'Open App' : 'Continue'}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </main>

      <footer className="px-4 py-6 text-center text-slate-500 text-sm">
        <p>This is a web-based communication service. It does not intercept carrier calls/SMS.</p>
      </footer>
    </div>
  );
}
