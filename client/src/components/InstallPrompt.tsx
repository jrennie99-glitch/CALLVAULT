import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Smartphone, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Detect iOS Safari
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

// Detect if already installed as PWA
const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isStandalone()) return;

    const dismissed = localStorage.getItem('cv-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Only dismiss for 24 hours (changed from 7 days to be more persistent)
      if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    // For iOS Safari, show custom instructions immediately
    if (isIOS()) {
      // Small delay to let the app load first
      setTimeout(() => {
        setShowIOSPrompt(true);
      }, 2000);
      return;
    }

    // For Android/Chrome, listen for the install prompt event
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
      localStorage.setItem('cv-installed', 'true');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSPrompt(false);
    setDismissed(true);
    localStorage.setItem('cv-install-dismissed', Date.now().toString());
  };

  // iOS-specific install instructions
  if (showIOSPrompt && !dismissed) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4 animate-in fade-in"
        data-testid="ios-install-prompt"
      >
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-8">
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
            data-testid="button-dismiss-ios-install"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="text-center mb-6">
            <div className="bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Smartphone className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Install Call Vault</h2>
            <p className="text-slate-400 text-sm mt-2">
              Get the full app experience with notifications for calls and messages
            </p>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3">
              <div className="bg-blue-500 rounded-lg p-2">
                <Share className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">1. Tap the Share button</p>
                <p className="text-slate-400 text-xs">At the bottom of your screen</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3">
              <div className="bg-slate-600 rounded-lg p-2">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">2. Tap "Add to Home Screen"</p>
                <p className="text-slate-400 text-xs">Scroll down to find it</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3">
              <div className="bg-emerald-500 rounded-lg p-2">
                <Download className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">3. Tap "Add"</p>
                <p className="text-slate-400 text-xs">Call Vault will be on your home screen</p>
              </div>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            onClick={handleDismiss}
            className="w-full"
            data-testid="button-got-it-ios"
          >
            Got it, I'll do this later
          </Button>
        </div>
      </div>
    );
  }

  // Android/Chrome install prompt
  if (!showPrompt || dismissed) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4 animate-in fade-in"
      data-testid="install-prompt"
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-8">
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2"
          data-testid="button-dismiss-install"
        >
          <X className="h-5 w-5" />
        </button>
        
        <div className="text-center mb-6">
          <div className="bg-emerald-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Smartphone className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Install Call Vault</h2>
          <p className="text-slate-400 text-sm mt-2">
            Add to your home screen for quick access and push notifications for calls & messages
          </p>
        </div>
        
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 text-xs">✓</span>
            </div>
            <span>Instant access from home screen</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 text-xs">✓</span>
            </div>
            <span>Get notified for incoming calls</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 text-xs">✓</span>
            </div>
            <span>Works offline</span>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleDismiss}
            className="flex-1"
            data-testid="button-later-install"
          >
            Later
          </Button>
          <Button 
            onClick={handleInstall}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-install-app"
          >
            <Download className="h-4 w-4 mr-2" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
