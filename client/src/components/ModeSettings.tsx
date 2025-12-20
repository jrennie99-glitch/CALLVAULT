import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Sparkles, Building2, Radio, Lock, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { UserMode } from '@shared/types';

interface ModeInfo {
  value: UserMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const MODES: ModeInfo[] = [
  {
    value: 'personal',
    label: 'Personal',
    description: 'Simple calling and messaging for everyday use',
    icon: <User className="w-5 h-5" />,
    color: 'bg-blue-500',
  },
  {
    value: 'creator',
    label: 'Creator',
    description: 'Accept paid calls and manage your audience',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'bg-purple-500',
  },
  {
    value: 'business',
    label: 'Business',
    description: 'Multiple lines, routing rules, and delegation',
    icon: <Building2 className="w-5 h-5" />,
    color: 'bg-emerald-500',
  },
  {
    value: 'stage',
    label: 'Stage',
    description: 'Broadcast rooms and large audience calls',
    icon: <Radio className="w-5 h-5" />,
    color: 'bg-orange-500',
  },
];

interface ModeSettingsProps {
  myAddress: string;
  onModeChange?: (mode: UserMode) => void;
}

export function ModeSettings({ myAddress, onModeChange }: ModeSettingsProps) {
  const [currentMode, setCurrentMode] = useState<UserMode>('personal');
  const [availableModes, setAvailableModes] = useState<UserMode[]>(['personal']);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchModeSettings();
  }, [myAddress]);

  const fetchModeSettings = async () => {
    try {
      const response = await fetch(`/api/mode/${encodeURIComponent(myAddress)}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentMode(data.mode);
        setAvailableModes(data.availableModes || ['personal']);
        setCurrentPlan(data.plan || 'free');
      }
    } catch (error) {
      console.error('Failed to fetch mode settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeSelect = async (mode: UserMode) => {
    if (!availableModes.includes(mode)) {
      toast.error('Upgrade your plan to access this mode');
      return;
    }

    if (mode === currentMode) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/mode/${encodeURIComponent(myAddress)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentMode(data.mode);
        toast.success(`Switched to ${MODES.find(m => m.value === mode)?.label} mode`);
        onModeChange?.(data.mode);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to change mode');
      }
    } catch (error) {
      console.error('Failed to update mode:', error);
      toast.error('Failed to change mode');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-700 rounded w-1/3" />
            <div className="h-10 bg-slate-700 rounded" />
            <div className="h-10 bg-slate-700 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentModeInfo = MODES.find(m => m.value === currentMode);

  return (
    <Card className="bg-slate-800/50 border-slate-700" data-testid="card-mode-settings">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Mode</CardTitle>
            <CardDescription className="text-slate-400">
              Choose how you want to use Call Vault
            </CardDescription>
          </div>
          {currentModeInfo && (
            <Badge 
              className={`${currentModeInfo.color} text-white`}
              data-testid="badge-current-mode"
            >
              {currentModeInfo.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {MODES.map((mode) => {
          const isAvailable = availableModes.includes(mode.value);
          const isSelected = currentMode === mode.value;

          return (
            <button
              key={mode.value}
              onClick={() => handleModeSelect(mode.value)}
              disabled={updating || (!isAvailable && !isSelected)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                isSelected
                  ? `${mode.color}/20 border-${mode.color.replace('bg-', '')}/50`
                  : isAvailable
                    ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                    : 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
              data-testid={`button-mode-${mode.value}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${mode.color}/20 flex items-center justify-center ${
                  isSelected ? 'text-white' : isAvailable ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  {mode.icon}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${isSelected ? 'text-white' : isAvailable ? 'text-slate-200' : 'text-slate-500'}`}>
                      {mode.label}
                    </p>
                    {!isAvailable && (
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <p className={`text-sm ${isAvailable ? 'text-slate-400' : 'text-slate-600'}`}>
                    {mode.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                {isSelected ? (
                  <div className={`w-6 h-6 rounded-full ${mode.color} flex items-center justify-center`}>
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : isAvailable ? (
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                ) : null}
              </div>
            </button>
          );
        })}

        {currentPlan === 'free' && (
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl">
            <p className="text-sm text-slate-300">
              Upgrade to <span className="text-purple-400 font-medium">Pro</span> or{' '}
              <span className="text-emerald-400 font-medium">Business</span> to unlock more modes and features.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
              onClick={() => window.location.href = '/pricing'}
              data-testid="button-upgrade-plan"
            >
              View Plans
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
