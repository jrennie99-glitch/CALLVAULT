import { useState, useEffect } from 'react';
import { User, Shield, Wifi, ChevronDown, ChevronUp, Copy, RefreshCw, Fingerprint, Eye, EyeOff, MessageSquare, CheckCheck, Clock, Phone, Ban, Bot, Wallet, ChevronRight, Ticket, Briefcase, BarChart3, Crown, Lock, Sparkles, CreditCard, ExternalLink, Snowflake } from 'lucide-react';
import { FreezeModeSetupModal } from '@/components/FreezeModeSetupModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getUserProfile, saveUserProfile, getAppSettings, saveAppSettings } from '@/lib/storage';
import { getPrivacySettings, savePrivacySettings, type PrivacySettings } from '@/lib/messageStorage';
import { enrollBiometric, disableBiometric, isPlatformAuthenticatorAvailable } from '@/lib/biometric';
import { toast } from 'sonner';
import { useEntitlements } from '@/hooks/useEntitlements';
import type { CryptoIdentity } from '@shared/types';

type SettingsScreen = 'main' | 'call_permissions' | 'blocklist' | 'ai_guardian' | 'wallet' | 'passes' | 'creator_mode' | 'earnings_dashboard' | 'admin_console';

interface SettingsTabProps {
  identity: CryptoIdentity | null;
  onRotateAddress: () => void;
  turnEnabled: boolean;
  ws?: WebSocket | null;
  onNavigate?: (screen: SettingsScreen) => void;
}

export function SettingsTab({ identity, onRotateAddress, turnEnabled, ws, onNavigate }: SettingsTabProps) {
  const [profile, setProfile] = useState(getUserProfile());
  const [settings, setSettings] = useState(getAppSettings());
  const [privacy, setPrivacy] = useState<PrivacySettings>(getPrivacySettings());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFounder, setIsFounder] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<'business' | 'earnings'>('business');
  
  const { isPro, isBusiness, hasTrial, trialDaysRemaining, trialMinutesRemaining } = useEntitlements(identity?.address || null);
  const [premiumAccess, setPremiumAccess] = useState<{
    hasAccess: boolean;
    accessType: 'subscription' | 'trial' | 'none';
    daysRemaining?: number;
    plan?: string;
    planStatus?: string;
    trialEndAt?: string;
  } | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [freezeMode, setFreezeMode] = useState(false);
  const [freezeModeSetupCompleted, setFreezeModeSetupCompleted] = useState(false);
  const [showFreezeModeSetup, setShowFreezeModeSetup] = useState(false);
  const [isTogglingFreezeMode, setIsTogglingFreezeMode] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    if (identity?.address) {
      fetch(`/api/freeze-mode/${identity.address}`)
        .then(res => res.json())
        .then(data => {
          setFreezeMode(data.enabled || false);
          setFreezeModeSetupCompleted(data.setupCompleted || false);
        })
        .catch(() => {});
    }
  }, [identity?.address]);

  useEffect(() => {
    if (identity?.address) {
      fetch(`/api/identity/${identity.address}/role`)
        .then(res => res.json())
        .then(data => {
          setIsAdmin(data.isAdmin || false);
          setIsFounder(data.isFounder || false);
        })
        .catch(() => {});
      
      fetch(`/api/premium-access/${identity.address}`)
        .then(res => res.json())
        .then(data => setPremiumAccess(data))
        .catch(() => {});
    }
  }, [identity?.address]);

  const handleUpgradeToPro = async () => {
    if (!identity?.address) return;
    setIsUpgrading(true);
    try {
      const plansRes = await fetch('/api/stripe/plans');
      if (!plansRes.ok) {
        toast.error('Unable to load subscription plans. Please try again later.');
        return;
      }
      const plansData = await plansRes.json();
      const proPlan = plansData.plans?.find((p: any) => p.id === 'pro');
      
      if (!proPlan?.priceId || proPlan.priceId.startsWith('price_')) {
        // priceId is a placeholder, show contact message
        if (!proPlan?.priceId || proPlan.priceId === 'price_pro_monthly') {
          toast.error('Subscriptions coming soon! Contact support for early access.');
          return;
        }
      }
      
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: identity.address,
          priceId: proPlan.priceId
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.error || 'Failed to create checkout session');
        return;
      }
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error('Unable to start upgrade. Please try again later.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    if (!identity?.address) return;
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: identity.address })
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('No billing account found');
      }
    } catch (error) {
      toast.error('Failed to open billing portal');
    }
  };

  const handleFreezeModeToggle = async (enabled: boolean) => {
    if (!identity?.address) return;
    
    if (enabled && !freezeModeSetupCompleted) {
      setShowFreezeModeSetup(true);
      return;
    }
    
    setIsTogglingFreezeMode(true);
    try {
      const res = await fetch(`/api/freeze-mode/${identity.address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update freeze mode');
      }
      
      const data = await res.json();
      setFreezeMode(data.freezeMode);
      toast.success(enabled ? 'Freeze Mode enabled' : 'Freeze Mode disabled');
    } catch (error) {
      toast.error('Failed to update Freeze Mode');
    } finally {
      setIsTogglingFreezeMode(false);
    }
  };

  const handleFreezeModeSetupComplete = async () => {
    if (!identity?.address) return;
    
    try {
      await fetch(`/api/freeze-mode/${identity.address}/setup-complete`, {
        method: 'PUT'
      });
      setFreezeModeSetupCompleted(true);
      
      const res = await fetch(`/api/freeze-mode/${identity.address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      });
      
      if (res.ok) {
        const data = await res.json();
        setFreezeMode(data.freezeMode);
        toast.success('Freeze Mode enabled!');
      }
    } catch (error) {
      toast.error('Failed to complete setup');
    }
  };

  const updatePrivacy = (updates: Partial<PrivacySettings>) => {
    const newPrivacy = { ...privacy, ...updates };
    setPrivacy(newPrivacy);
    savePrivacySettings(newPrivacy);
  };

  const updateProfile = (updates: Partial<typeof profile>) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    saveUserProfile(newProfile);
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      setIsEnrolling(true);
      try {
        await enrollBiometric();
        const newSettings = { ...settings, biometricLockEnabled: true };
        setSettings(newSettings);
        saveAppSettings(newSettings);
        toast.success('Biometric lock enabled');
      } catch (error: any) {
        toast.error(error.message || 'Failed to enable biometric lock');
      } finally {
        setIsEnrolling(false);
      }
    } else {
      await disableBiometric();
      const newSettings = { ...settings, biometricLockEnabled: false };
      setSettings(newSettings);
      saveAppSettings(newSettings);
      toast.success('Biometric lock disabled');
    }
  };

  const copyAddress = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.address);
      toast.success('Address copied!');
    }
  };

  const copyPublicKey = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.publicKeyBase58);
      toast.success('Public key copied!');
    }
  };

  const handleBusinessModeClick = () => {
    if (isBusiness || isPro) {
      onNavigate?.('creator_mode');
    } else {
      setUpgradeFeature('business');
      setShowUpgradeDialog(true);
    }
  };

  const handleEarningsDashboardClick = () => {
    if (isBusiness || isPro) {
      onNavigate?.('earnings_dashboard');
    } else {
      setUpgradeFeature('earnings');
      setShowUpgradeDialog(true);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Display Name</Label>
            <Input
              value={profile.displayName}
              onChange={(e) => updateProfile({ displayName: e.target.value })}
              className="mt-1 bg-slate-900/50 border-slate-600 text-white"
              data-testid="input-display-name"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-400" />
            Subscription & Billing
          </CardTitle>
          <CardDescription className="text-slate-400">
            {premiumAccess?.hasAccess 
              ? premiumAccess.accessType === 'subscription' 
                ? 'Active subscription'
                : 'Trial access'
              : 'Free plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300">Current Plan</span>
              <Badge className={
                premiumAccess?.plan === 'business' ? 'bg-orange-500' :
                premiumAccess?.plan === 'pro' ? 'bg-purple-500' :
                premiumAccess?.accessType === 'trial' ? 'bg-green-500' :
                'bg-slate-600'
              }>
                {premiumAccess?.plan === 'business' ? 'Business' :
                 premiumAccess?.plan === 'pro' ? 'Pro' :
                 premiumAccess?.accessType === 'trial' ? 'Trial' :
                 'Free'}
              </Badge>
            </div>
            
            {premiumAccess?.accessType === 'subscription' && premiumAccess.planStatus === 'active' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  Active
                </span>
              </div>
            )}
            
            {premiumAccess?.accessType === 'subscription' && premiumAccess.planStatus === 'past_due' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="text-yellow-400">Payment Past Due</span>
              </div>
            )}
            
            {premiumAccess?.daysRemaining && premiumAccess.daysRemaining > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-slate-500">
                  {premiumAccess.accessType === 'trial' ? 'Trial ends in' : 'Renews in'}
                </span>
                <span className="text-slate-300">{premiumAccess.daysRemaining} days</span>
              </div>
            )}
            
            {hasTrial && trialMinutesRemaining !== null && trialMinutesRemaining > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-slate-500">Trial minutes remaining</span>
                <span className="text-green-400">{trialMinutesRemaining} min</span>
              </div>
            )}
          </div>
          
          {premiumAccess?.hasAccess && premiumAccess.accessType === 'subscription' ? (
            <Button 
              onClick={handleManageBilling}
              variant="outline"
              className="w-full border-slate-600"
              data-testid="button-manage-billing"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Manage Billing
            </Button>
          ) : (
            <div className="space-y-2">
              <Button 
                onClick={handleUpgradeToPro}
                disabled={isUpgrading}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                data-testid="button-upgrade-pro"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isUpgrading ? 'Opening checkout...' : 'Upgrade to Pro - $9/mo'}
              </Button>
              <p className="text-xs text-slate-500 text-center">
                Unlock creator features, paid calls, and priority support
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Call Settings
          </CardTitle>
          <CardDescription className="text-slate-400">
            People can only reach you with your permission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className={`p-3 rounded-lg ${freezeMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-slate-900/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Snowflake className={`w-5 h-5 ${freezeMode ? 'text-cyan-400' : 'text-slate-400'}`} />
                <div>
                  <p className="text-white font-medium flex items-center gap-2">
                    Freeze Mode
                    {freezeMode && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">Active</Badge>
                    )}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {freezeMode 
                      ? 'Only approved contacts can reach you' 
                      : 'Silence all unwanted calls'}
                  </p>
                </div>
              </div>
              <Switch
                checked={freezeMode}
                onCheckedChange={handleFreezeModeToggle}
                disabled={isTogglingFreezeMode}
                data-testid="switch-freeze-mode"
              />
            </div>
          </div>

          <button
            onClick={() => onNavigate?.('call_permissions')}
            className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
            data-testid="button-call-permissions"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400" />
              <div className="text-left">
                <p className="text-white font-medium">Call Permissions</p>
                <p className="text-slate-500 text-sm">Who can call you & spam protection</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={() => onNavigate?.('passes')}
            className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
            data-testid="button-invite-passes"
          >
            <div className="flex items-center gap-3">
              <Ticket className="w-5 h-5 text-purple-400" />
              <div className="text-left">
                <p className="text-white font-medium">Call Invites</p>
                <p className="text-slate-500 text-sm">Create invites to let others call you</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={() => onNavigate?.('blocklist')}
            className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
            data-testid="button-blocklist"
          >
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-red-400" />
              <div className="text-left">
                <p className="text-white font-medium">Blocked Users</p>
                <p className="text-slate-500 text-sm">Manage blocked callers</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Privacy & Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Biometric Lock</p>
                <p className="text-slate-500 text-sm">
                  {biometricAvailable ? 'Use Face ID or Touch ID' : 'Not available on this device'}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.biometricLockEnabled}
              onCheckedChange={handleBiometricToggle}
              disabled={!biometricAvailable || isEnrolling}
              data-testid="switch-biometric"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.hideAdvancedByDefault ? (
                <EyeOff className="w-5 h-5 text-slate-400" />
              ) : (
                <Eye className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <p className="text-white font-medium">Hide Advanced Info</p>
                <p className="text-slate-500 text-sm">Public key and address hidden by default</p>
              </div>
            </div>
            <Switch
              checked={settings.hideAdvancedByDefault}
              onCheckedChange={(checked) => {
                const newSettings = { ...settings, hideAdvancedByDefault: checked };
                setSettings(newSettings);
                saveAppSettings(newSettings);
              }}
              data-testid="switch-hide-advanced"
            />
          </div>

          <button
            onClick={() => onNavigate?.('ai_guardian')}
            className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
            data-testid="button-ai-guardian"
          >
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-orange-400" />
              <div className="text-left">
                <p className="text-white font-medium flex items-center gap-2">
                  AI Call Guardian
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Beta</span>
                </p>
                <p className="text-slate-500 text-sm">Spam & abuse detection</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={() => onNavigate?.('wallet')}
            className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
            data-testid="button-wallet-verify"
          >
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-blue-400" />
              <div className="text-left">
                <p className="text-white font-medium">
                  Wallet Verification
                </p>
                <p className="text-slate-500 text-sm">Optional trust badge</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={handleBusinessModeClick}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg hover:from-purple-500/20 hover:to-pink-500/20 transition-all"
            data-testid="button-creator-mode"
          >
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-purple-400" />
              <div className="text-left">
                <p className="text-white font-medium flex items-center gap-2">
                  Business Mode
                  {isPro || isBusiness ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Pro</span>
                  )}
                </p>
                <p className="text-slate-500 text-sm">Accept paid calls & set hours</p>
              </div>
            </div>
            {isPro || isBusiness ? (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            ) : (
              <Lock className="w-5 h-5 text-slate-500" />
            )}
          </button>

          <button
            onClick={handleEarningsDashboardClick}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg hover:from-green-500/20 hover:to-emerald-500/20 transition-all"
            data-testid="button-earnings-dashboard"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-green-400" />
              <div className="text-left">
                <p className="text-white font-medium flex items-center gap-2">
                  Earnings Dashboard
                  {isPro || isBusiness ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Pro</span>
                  )}
                </p>
                <p className="text-slate-500 text-sm">View your call stats & earnings</p>
              </div>
            </div>
            {isPro || isBusiness ? (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            ) : (
              <Lock className="w-5 h-5 text-slate-500" />
            )}
          </button>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Message Privacy
          </CardTitle>
          <CardDescription className="text-slate-400">
            Control what others see about your activity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCheck className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Read Receipts</p>
                <p className="text-slate-500 text-sm">Let others know when you've read messages</p>
              </div>
            </div>
            <Switch
              checked={privacy.readReceipts}
              onCheckedChange={(checked) => updatePrivacy({ readReceipts: checked })}
              data-testid="switch-read-receipts"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Typing Indicators</p>
                <p className="text-slate-500 text-sm">Show when you're typing a message</p>
              </div>
            </div>
            <Switch
              checked={privacy.typingIndicators}
              onCheckedChange={(checked) => updatePrivacy({ typingIndicators: checked })}
              data-testid="switch-typing-indicators"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-white font-medium">Last Seen</p>
                <p className="text-slate-500 text-sm">Show when you were last online</p>
              </div>
            </div>
            <Switch
              checked={privacy.lastSeen}
              onCheckedChange={(checked) => updatePrivacy({ lastSeen: checked })}
              data-testid="switch-last-seen"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Network
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">ICE Mode</p>
              <p className="text-slate-500 text-sm">
                {turnEnabled ? 'TURN + STUN (Full NAT Support)' : 'STUN Only'}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${turnEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
              {turnEnabled ? 'Enhanced' : 'Basic'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between"
          >
            <CardTitle className="text-white">Advanced Identity</CardTitle>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {!showAdvanced && (
            <CardDescription className="text-slate-500">
              View your identity and security details
            </CardDescription>
          )}
        </CardHeader>
        {showAdvanced && identity && (
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-400 text-sm">Public Key</Label>
              <div className="mt-1 p-3 bg-slate-900/50 rounded-lg font-mono text-xs text-slate-300 break-all">
                {identity.publicKeyBase58}
              </div>
              <Button
                onClick={copyPublicKey}
                variant="ghost"
                size="sm"
                className="mt-2 text-slate-400 hover:text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Public Key
              </Button>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Call ID</Label>
              <div className="mt-1 p-3 bg-slate-900/50 rounded-lg font-mono text-xs text-emerald-400 break-all" data-testid="text-call-address">
                {identity.address}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={copyAddress}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                  data-testid="button-copy-address"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Call ID
                </Button>
                <Button
                  onClick={onRotateAddress}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                  data-testid="button-rotate-address"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Address
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
      {isAdmin && (
        <Card className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              Administration
            </CardTitle>
            <CardDescription className="text-slate-400">
              {isFounder ? 'Founder access' : 'Admin access'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => onNavigate?.('admin_console')}
              className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
              data-testid="button-admin-console"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-yellow-400" />
                <div className="text-left">
                  <p className="text-white font-medium">Admin Console</p>
                  <p className="text-slate-500 text-sm">Manage users, trials, and system settings</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm italic">
            "Calls only happen with your permission."
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Call Vault uses end-to-end encryption for secure peer-to-peer calling.
          </p>
        </CardContent>
      </Card>

      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Upgrade to Pro
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {upgradeFeature === 'business' 
                ? 'Business Mode lets you accept paid calls, set business hours, and build your creator profile.'
                : 'Earnings Dashboard shows your call statistics, revenue tracking, and payment history.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Pro Plan</span>
                <Badge className="bg-purple-500">$9/month</Badge>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Paid call links
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Business hours & scheduling
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Earnings dashboard
                </li>
              </ul>
            </div>
            
            <div className="text-center text-sm text-slate-400">
              <p>Try free for 7 days + 30 minutes</p>
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => setShowUpgradeDialog(false)}
                data-testid="button-cancel-upgrade"
              >
                Maybe Later
              </Button>
              <Button 
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                disabled={isUpgrading}
                onClick={() => {
                  setShowUpgradeDialog(false);
                  handleUpgradeToPro();
                }}
                data-testid="button-view-plans"
              >
                {isUpgrading ? 'Loading...' : 'Upgrade Now'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FreezeModeSetupModal
        open={showFreezeModeSetup}
        onClose={() => setShowFreezeModeSetup(false)}
        onComplete={handleFreezeModeSetupComplete}
      />
    </div>
  );
}
