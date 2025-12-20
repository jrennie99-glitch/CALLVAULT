import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('cv-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('cv-install-dismissed', Date.now().toString());
  };

  if (!showPrompt || dismissed) return null;

  return (
    <div 
      className="fixed bottom-20 left-4 right-4 z-50 bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xl animate-in slide-in-from-bottom-4"
      data-testid="install-prompt"
    >
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-white p-1"
        data-testid="button-dismiss-install"
      >
        <X className="h-4 w-4" />
      </button>
      
      <div className="flex items-start gap-3">
        <div className="bg-emerald-500/20 p-2 rounded-lg shrink-0">
          <Smartphone className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm">Install Call Vault</h3>
          <p className="text-slate-400 text-xs mt-1">
            Add to your home screen for quick access and a better experience.
          </p>
        </div>
      </div>
      
      <div className="flex gap-2 mt-3">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDismiss}
          className="flex-1 text-xs"
          data-testid="button-later-install"
        >
          Maybe Later
        </Button>
        <Button 
          size="sm" 
          onClick={handleInstall}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
          data-testid="button-install-app"
        >
          <Download className="h-3 w-3 mr-1" />
          Install
        </Button>
      </div>
    </div>
  );
}
