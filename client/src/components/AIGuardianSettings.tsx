import { useState } from 'react';
import { Bot, Shield, AlertTriangle, Mic, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { getAIGuardianSettings, saveAIGuardianSettings } from '@/lib/policyStorage';
import { toast } from 'sonner';
import type { AIGuardianSettings as AIGuardianSettingsType } from '@shared/types';

interface AIGuardianSettingsProps {
  onBack: () => void;
}

export function AIGuardianSettings({ onBack }: AIGuardianSettingsProps) {
  const [settings, setSettings] = useState<AIGuardianSettingsType>(getAIGuardianSettings());

  const updateSettings = (updates: Partial<AIGuardianSettingsType>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveAIGuardianSettings(newSettings);
    toast.success('Settings saved');
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-emerald-400 mb-4"
        data-testid="button-back-ai-guardian"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI Call Guardian
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Beta</span>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Optional AI-powered protection during calls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Enable AI Guardian</p>
                <p className="text-slate-500 text-sm">Detect spam and abuse patterns</p>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => updateSettings({ enabled: checked })}
              data-testid="switch-ai-guardian"
            />
          </div>

          {settings.enabled && (
            <>
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p className="text-emerald-400 text-sm">
                  <strong>Privacy first:</strong> AI Guardian runs locally and never records or sends your calls.
                  It only analyzes call patterns to detect suspicious behavior.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-white font-medium">What it does:</h4>
                <ul className="space-y-2 text-slate-400 text-sm">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    Detects repeated call spam attempts
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    Shows warnings for suspicious caller patterns
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                    Offers one-tap block for potential spam
                  </li>
                </ul>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-white font-medium">Live Transcription</p>
                      <p className="text-slate-500 text-sm">Uses browser speech recognition</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.transcription_enabled}
                    onCheckedChange={(checked) => updateSettings({ transcription_enabled: checked })}
                    data-testid="switch-transcription"
                  />
                </div>
                {settings.transcription_enabled && (
                  <p className="text-orange-400 text-xs mt-2 ml-8">
                    Transcription uses your browser's Web Speech API. Some browsers may have limited support.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!settings.enabled && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-4">
            <p className="text-slate-500 text-sm">
              AI Guardian is <strong className="text-slate-400">off by default</strong> to respect your privacy.
              Enable it only if you want additional protection against spam and abuse.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
