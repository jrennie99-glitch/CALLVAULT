import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Bell, BellOff, Shield, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface FreezeModeSetupModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function FreezeModeSetupModal({ open, onClose, onComplete }: FreezeModeSetupModalProps) {
  const [step, setStep] = useState(0);
  
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  const steps = [
    {
      title: "Welcome to Freeze Mode",
      description: "Freeze Mode silences all unwanted calls. Only people you approve can reach you through this app.",
      icon: Shield,
      content: (
        <div className="space-y-4 text-center">
          <div className="bg-primary/10 rounded-lg p-4 mx-auto w-fit">
            <Shield className="w-16 h-16 text-primary" />
          </div>
          <p className="text-muted-foreground">
            When enabled, unknown callers will be required to request access before they can ring you.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg p-3">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
              <p>Approved contacts ring normally</p>
            </div>
            <div className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg p-3">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
              <p>Paid callers can reach you</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Step 1: Enable Do Not Disturb",
      description: "Turn on Focus or Do Not Disturb to silence your phone's other notifications.",
      icon: BellOff,
      content: (
        <div className="space-y-4">
          <div className="bg-orange-500/10 rounded-lg p-4 text-center">
            <BellOff className="w-12 h-12 text-orange-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              This silences calls and texts from unknown numbers on your carrier.
            </p>
          </div>
          
          {isIOS && (
            <div className="space-y-2">
              <Badge variant="secondary">iOS</Badge>
              <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                <li>Open <strong>Settings</strong> → <strong>Focus</strong></li>
                <li>Create or select a Focus mode (e.g., "Do Not Disturb")</li>
                <li>Enable the Focus mode</li>
              </ol>
              <Button variant="outline" className="w-full gap-2" onClick={() => window.open('app-settings:', '_blank')}>
                <Smartphone className="w-4 h-4" />
                Open iOS Settings
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {isAndroid && (
            <div className="space-y-2">
              <Badge variant="secondary">Android</Badge>
              <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                <li>Swipe down to open Quick Settings</li>
                <li>Tap <strong>Do Not Disturb</strong> to enable</li>
                <li>Or go to <strong>Settings</strong> → <strong>Sound</strong> → <strong>Do Not Disturb</strong></li>
              </ol>
              <Button variant="outline" className="w-full gap-2" onClick={() => window.open('intent://#Intent;action=android.settings.ZEN_MODE_SETTINGS;end', '_blank')}>
                <Smartphone className="w-4 h-4" />
                Open Android Settings
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {!isIOS && !isAndroid && (
            <div className="space-y-2">
              <Badge variant="secondary">Desktop</Badge>
              <p className="text-sm text-muted-foreground">
                On desktop, enable your system's focus or do not disturb mode to silence other notifications.
              </p>
            </div>
          )}
        </div>
      )
    },
    {
      title: "Step 2: Allow This App's Notifications",
      description: "Make sure CallVS can still notify you when approved contacts call.",
      icon: Bell,
      content: (
        <div className="space-y-4">
          <div className="bg-blue-500/10 rounded-lg p-4 text-center">
            <Bell className="w-12 h-12 text-blue-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Allow CallVS notifications so approved calls can still reach you.
            </p>
          </div>
          
          {isIOS && (
            <div className="space-y-2">
              <Badge variant="secondary">iOS</Badge>
              <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                <li>In your Focus settings, tap <strong>Apps</strong></li>
                <li>Add <strong>CallVS</strong> to allowed apps</li>
                <li>This lets approved calls notify you even in Focus mode</li>
              </ol>
            </div>
          )}
          
          {isAndroid && (
            <div className="space-y-2">
              <Badge variant="secondary">Android</Badge>
              <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                <li>In DND settings, tap <strong>Apps</strong> or <strong>Exceptions</strong></li>
                <li>Add <strong>CallVS</strong> as an exception</li>
                <li>This allows the app to notify you in DND mode</li>
              </ol>
            </div>
          )}
          
          {!isIOS && !isAndroid && (
            <p className="text-sm text-muted-foreground">
              Make sure this browser tab is allowed to send notifications through your system's focus mode.
            </p>
          )}
        </div>
      )
    },
    {
      title: "You're All Set!",
      description: "Freeze Mode is now active. Only approved contacts will be able to reach you.",
      icon: CheckCircle2,
      content: (
        <div className="space-y-4 text-center">
          <div className="bg-green-500/10 rounded-lg p-6 mx-auto w-fit">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
          </div>
          <div className="space-y-2">
            <p className="font-medium">Freeze Mode is ready!</p>
            <p className="text-sm text-muted-foreground">
              Unknown callers will now need to request access before they can ring you.
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
            <p className="font-medium">Pro tip:</p>
            <p className="text-muted-foreground">
              Mark trusted contacts as "Always Allowed" to let them bypass Freeze Mode for emergencies.
            </p>
          </div>
        </div>
      )
    }
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      onClose();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md" data-testid="freeze-mode-setup-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <DialogTitle>{currentStep.title}</DialogTitle>
          </div>
          <DialogDescription>{currentStep.description}</DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {currentStep.content}
        </div>
        
        <div className="flex justify-center gap-1 py-2">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 w-8 rounded-full transition-colors ${i === step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={handleBack} data-testid="button-setup-back">
              Back
            </Button>
          )}
          <Button onClick={handleNext} className="flex-1" data-testid="button-setup-next">
            {isLastStep ? "Complete Setup" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
