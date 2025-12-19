import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { 
  Shield, ArrowLeft, ArrowRight, ChevronDown
} from 'lucide-react';
import { useState } from 'react';

interface FAQItemProps {
  question: string;
  answer: string;
  index: number;
}

function FAQItem({ question, answer, index }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-slate-700 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-start justify-between text-left hover:bg-slate-800/30 transition-colors px-4 -mx-4 rounded-lg"
        data-testid={`faq-question-${index}`}
      >
        <span className="text-lg font-medium text-white pr-4">{question}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pb-6 text-slate-300 leading-relaxed" data-testid={`faq-answer-${index}`}>
          {answer}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [, setLocation] = useLocation();

  const faqs = [
    {
      question: "Does this block carrier phone calls or SMS?",
      answer: "No. This service does not intercept carrier calls or text messages. Instead, it lets you stop using your phone number as your primary contact method so unwanted calls don't interrupt you."
    },
    {
      question: "How does this reduce spam calls?",
      answer: "Calls are permission-based. If someone isn't approved, they can't notify you through this service. Many users keep their phone on Do Not Disturb and use this app as their intentional call channel."
    },
    {
      question: "Do I have to give up my phone number?",
      answer: "No. You keep it. Most users simply stop sharing it publicly and share an invite link or approval request instead."
    },
    {
      question: "Do you sell or share user data?",
      answer: "No ads, no data broker partnerships, and no selling personal data. Privacy is the point."
    },
    {
      question: "Is this a phone carrier?",
      answer: "No. This is a web-based communication service that works over the internet."
    },
    {
      question: "What is Freeze Mode?",
      answer: "Freeze Mode is a feature that silences all calls from unknown or unapproved contacts. When enabled, only approved contacts, paid callers, and 'Always Allowed' emergency contacts can ring through. Everyone else must request access first."
    },
    {
      question: "How do I let emergency contacts through?",
      answer: "You can mark any contact as 'Always Allowed' in their contact settings. These contacts will always be able to reach you, even when Freeze Mode is on."
    },
    {
      question: "Is this available on the App Store?",
      answer: "This is a web-based application that works in your browser. You can add it to your home screen for an app-like experience, but it's not distributed through app stores."
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
          <span className="text-xl font-bold">Call Vault</span>
        </div>
        <Button onClick={() => setLocation('/onboarding')} data-testid="button-get-started">
          Get Started
        </Button>
      </header>

      <main className="px-4 py-12 max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-slate-300">
            Everything you need to know about private, spam-free communication.
          </p>
        </div>

        <div className="bg-slate-800/30 rounded-2xl p-4 md:p-8 mb-16">
          {faqs.map((faq, index) => (
            <FAQItem 
              key={index} 
              question={faq.question} 
              answer={faq.answer}
              index={index}
            />
          ))}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
          <p className="text-slate-400 mb-8">Get started and explore the app for yourself.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
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
              onClick={() => setLocation('/how-it-works')}
              data-testid="link-how-it-works"
            >
              How It Works
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
