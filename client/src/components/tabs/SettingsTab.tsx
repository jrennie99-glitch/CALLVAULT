import { useState, useEffect } from 'react';
import { User, Shield, Wifi, ChevronDown, ChevronUp, Copy, RefreshCw, Fingerprint, Eye, EyeOff, MessageSquare, CheckCheck, Clock, Phone, Ban, Bot, Wallet, ChevronRight, Ticket, Briefcase, BarChart3, Crown, Lock, Sparkles, CreditCard, ExternalLink, Snowflake, Download, Upload, Cloud, CloudOff, Check, LogOut, AlertTriangle, BellOff, Video, Mic, Bell, Smartphone } from 'lucide-react';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { FreezeModeSetupModal } from '@/components/FreezeModeSetupModal';
import { ModeSettings } from '@/components/ModeSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getUserProfile, saveUserProfile, getAppSettings, saveAppSettings } from '@/lib/storage';
import { exportIdentity, importIdentity, encryptIdentityForVault, decryptIdentityFromVault, saveIdentity, signPayload, generateNonce } from '@/lib/crypto';
import { getPrivacySettings, savePrivacySettings, type PrivacySettings } from '@/lib/messageStorage';
import { enrollBiometric, disableBiometric, isPlatformAuthenticatorAvailable, isInIframe, isIOS } from '@/lib/biometric';
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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importBackupText, setImportBackupText] = useState('');
  
  // Identity vault state
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultHint, setVaultHint] = useState<string | null>(null);
  const [showVaultSetupDialog, setShowVaultSetupDialog] = useState(false);
  const [vaultPin, setVaultPin] = useState('');
  const [vaultPinConfirm, setVaultPinConfirm] = useState('');
  const [vaultPinHint, setVaultPinHint] = useState('');
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [isTogglingDnd, setIsTogglingDnd] = useState(false);
  const [showDeviceTest, setShowDeviceTest] = useState(false);
  const [deviceTestStatus, setDeviceTestStatus] = useState<{
    camera: 'pending' | 'success' | 'error';
    microphone: 'pending' | 'success' | 'error';
  }>({ camera: 'pending', microphone: 'pending' });
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [skipPreCallCheck, setSkipPreCallCheck] = useState(() => 
    localStorage.getItem('cv_skip_precall_check') === 'true'
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOSBrowser, setIsIOSBrowser] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
    
    // Check notification permission
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
    
    // Detect iOS Safari browser (not installed PWA)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
    setIsIOSBrowser(isIOS && !isStandalone);
    setIsPwaInstalled(isStandalone);
    
    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
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
      
      fetch(`/api/dnd/${identity.address}`)
        .then(res => res.json())
        .then(data => {
          setDndEnabled(data.doNotDisturb || false);
        })
        .catch(() => {});
      
      // Check push notification status
      fetch(`/api/push/status/${identity.address}`)
        .then(res => res.json())
        .then(data => {
          setPushEnabled(data.enabled || false);
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

  // Check if identity vault exists
  useEffect(() => {
    if (identity?.publicKeyBase58) {
      fetch(`/api/identity/vault-exists/${identity.publicKeyBase58}`)
        .then(res => res.json())
        .then(data => {
          setVaultExists(data.exists || false);
          setVaultHint(data.hint || null);
        })
        .catch(() => {});
    }
  }, [identity?.publicKeyBase58]);

  const handleCreateVault = async () => {
    if (!identity) return;
    
    if (vaultPin.length < 6) {
      toast.error('PIN must be at least 6 digits');
      return;
    }
    
    if (vaultPin !== vaultPinConfirm) {
      toast.error('PINs do not match');
      return;
    }
    
    setIsCreatingVault(true);
    try {
      const { encryptedData, salt } = await encryptIdentityForVault(identity, vaultPin);
      
      // Create signed payload to prove ownership
      const nonce = generateNonce();
      const timestamp = Date.now();
      const hint = vaultPinHint || null;
      const payload = {
        publicKeyBase58: identity.publicKeyBase58,
        encryptedKeypair: encryptedData,
        salt,
        hint,
        nonce,
        timestamp
      };
      const signature = signPayload(identity.secretKey, payload);
      
      const res = await fetch('/api/identity/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          signature,
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create vault');
      }
      
      setVaultExists(true);
      setVaultHint(vaultPinHint || null);
      setShowVaultSetupDialog(false);
      setVaultPin('');
      setVaultPinConfirm('');
      setVaultPinHint('');
      toast.success('Cloud sync enabled! Your identity is now backed up.');
    } catch (error) {
      console.error('Failed to create vault:', error);
      toast.error('Failed to enable cloud sync');
    } finally {
      setIsCreatingVault(false);
    }
  };

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

  const handleDndToggle = async (enabled: boolean) => {
    if (!identity?.address) return;
    
    setIsTogglingDnd(true);
    try {
      const timestamp = Date.now();
      const nonce = generateNonce();
      const callIdAddress = identity.address;
      const ownerAddress = identity.address;
      
      const payload = { callIdAddress, ownerAddress, enabled, timestamp, nonce };
      const signature = signPayload(identity.secretKey, payload);
      
      const res = await fetch(`/api/call-id-settings/${identity.address}/dnd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerAddress,
          enabled,
          signature,
          timestamp,
          nonce
        })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update DND');
      }
      
      const data = await res.json();
      setDndEnabled(data.doNotDisturb || enabled);
      toast.success(enabled ? 'Do Not Disturb enabled' : 'Do Not Disturb disabled');
    } catch (error) {
      toast.error('Failed to update Do Not Disturb');
    } finally {
      setIsTogglingDnd(false);
    }
  };

  const startDeviceTest = async () => {
    setShowDeviceTest(true);
    setDeviceTestStatus({ camera: 'pending', microphone: 'pending' });
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setTestStream(stream);
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      setDeviceTestStatus({
        camera: videoTracks.length > 0 && videoTracks[0].readyState === 'live' ? 'success' : 'error',
        microphone: audioTracks.length > 0 && audioTracks[0].readyState === 'live' ? 'success' : 'error'
      });
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        setDeviceTestStatus({ camera: 'error', microphone: 'error' });
        toast.error('Camera and microphone access denied');
      } else {
        setDeviceTestStatus({ camera: 'error', microphone: 'error' });
        toast.error('Could not access camera or microphone');
      }
    }
  };

  const stopDeviceTest = () => {
    if (testStream) {
      testStream.getTracks().forEach(track => track.stop());
      setTestStream(null);
    }
    setShowDeviceTest(false);
    setDeviceTestStatus({ camera: 'pending', microphone: 'pending' });
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!identity?.address) return;
    
    setIsPushLoading(true);
    try {
      if (enabled) {
        // Detect iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isIOSSafari = isIOS && isSafari;
        
        // Check if running as installed PWA (standalone mode)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                            (window.navigator as any).standalone === true;
        
        // On iOS Safari, push only works when installed as PWA
        if (isIOSSafari && !isStandalone) {
          toast.error('On iOS, please install this app first: tap Share, then "Add to Home Screen"', { duration: 6000 });
          return;
        }
        
        // Check basic notification support
        if (!('Notification' in window)) {
          if (isIOS) {
            toast.error('Install this app to your home screen to enable notifications', { duration: 5000 });
          } else {
            toast.error('Notifications not supported in this browser');
          }
          return;
        }
        
        // Check PushManager support
        if (!('PushManager' in window)) {
          if (isIOS) {
            toast.error('Install this app to your home screen first, then enable notifications', { duration: 5000 });
          } else {
            toast.error('Push notifications not supported. Try Chrome or Firefox.');
          }
          return;
        }
        
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        
        if (permission !== 'granted') {
          toast.error('Notification permission denied. Please enable in browser settings.');
          return;
        }
        
        // Get VAPID key
        const vapidRes = await fetch('/api/push/vapid-public-key');
        if (!vapidRes.ok) {
          toast.error('Push notifications not configured on server');
          return;
        }
        const { vapidPublicKey } = await vapidRes.json();
        
        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;
        
        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
        
        // Send subscription to server
        const subscribeRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: identity.address,
            subscription: subscription.toJSON()
          })
        });
        
        if (subscribeRes.ok) {
          setPushEnabled(true);
          toast.success('Notifications enabled! You will receive alerts for incoming calls.');
        } else {
          toast.error('Failed to save notification subscription');
        }
      } else {
        // Unsubscribe
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          await subscription.unsubscribe();
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: identity.address,
              endpoint: subscription.endpoint
            })
          });
        }
        
        setPushEnabled(false);
        toast.success('Notifications disabled');
      }
    } catch (error) {
      console.error('Push notification error:', error);
      toast.error('Failed to update notification settings');
    } finally {
      setIsPushLoading(false);
    }
  };

  const sendTestNotification = async () => {
    if (!identity?.address || !identity?.keypair) return;
    
    try {
      const timestamp = Date.now().toString();
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Sign the request
      const message = `push-test:${identity.address}:${timestamp}:${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, identity.keypair.secretKey);
      const signature = bs58.encode(signatureBytes);
      
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userAddress: identity.address,
          signature,
          timestamp,
          nonce
        })
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success('Test notification sent!');
      } else {
        toast.error(data.message || data.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Test notification error:', error);
      toast.error('Failed to send test notification');
    }
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('App installed! You can now receive calls even when browser is closed.');
        setCanInstallPwa(false);
      }
      setDeferredPrompt(null);
    }
  };

  // Helper function to convert VAPID key
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

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

  const hasFullAccess = isFounder || isPro || isBusiness;
  
  const handleBusinessModeClick = () => {
    if (hasFullAccess) {
      onNavigate?.('creator_mode');
    } else {
      setUpgradeFeature('business');
      setShowUpgradeDialog(true);
    }
  };

  const handleEarningsDashboardClick = () => {
    if (hasFullAccess) {
      onNavigate?.('earnings_dashboard');
    } else {
      setUpgradeFeature('earnings');
      setShowUpgradeDialog(true);
    }
  };

  const handleExportIdentity = () => {
    if (!identity) return;
    const backup = exportIdentity(identity);
    
    // Create download
    const blob = new Blob([backup], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `callvault-backup-${identity.address.slice(5, 15)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Identity backup exported! Keep this file safe.');
  };

  const handleImportIdentity = () => {
    if (!importBackupText.trim()) {
      toast.error('Please paste your backup text');
      return;
    }
    
    const imported = importIdentity(importBackupText);
    
    if (imported) {
      toast.success('Identity restored! Reloading app...');
      setShowImportDialog(false);
      setImportBackupText('');
      // Reload to apply new identity
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.error('Invalid backup file. Please check and try again.');
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Founder Badge Banner */}
      {isFounder && (
        <Card className="bg-gradient-to-r from-yellow-500/20 via-amber-500/20 to-orange-500/20 border border-yellow-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">Founder</span>
                  <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                    <Sparkles className="w-3 h-3 mr-1" /> Full Access
                  </Badge>
                </div>
                <p className="text-yellow-200/70 text-sm">You have full admin privileges and can manage all users</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          {identity && (
            <div>
              <Label className="text-slate-300">Your Call ID</Label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 p-2.5 bg-slate-900/50 border border-slate-600 rounded-md font-mono text-xs text-emerald-400 truncate" data-testid="text-call-id-header">
                  {identity.address}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(identity.address);
                    toast.success('Call ID copied!');
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white shrink-0"
                  data-testid="button-copy-call-id"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
              </div>
              <p className="text-slate-500 text-xs mt-1">Share this ID with others so they can call you</p>
            </div>
          )}
        </CardContent>
      </Card>

      {identity && (
        <ModeSettings myAddress={identity.address} />
      )}

      {/* For founders, show founder access card instead of subscription */}
      {isFounder ? (
        <Card className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              Founder Access
            </CardTitle>
            <CardDescription className="text-amber-200/70">
              Lifetime full access to all features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Current Plan</span>
                <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white">
                  <Crown className="w-3 h-3 mr-1" /> Founder
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  Active
                </span>
              </div>
            </div>
            <p className="text-xs text-amber-200/50 text-center mt-3">
              All modes, features, and premium access unlocked
            </p>
          </CardContent>
        </Card>
      ) : (
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
      )}

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

          <div className={`p-3 rounded-lg ${dndEnabled ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-900/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BellOff className={`w-5 h-5 ${dndEnabled ? 'text-amber-400' : 'text-slate-400'}`} />
                <div>
                  <p className="text-white font-medium flex items-center gap-2">
                    Do Not Disturb
                    {dndEnabled && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs">Active</Badge>
                    )}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {dndEnabled 
                      ? 'All calls go to voicemail' 
                      : 'Block incoming calls temporarily'}
                  </p>
                </div>
              </div>
              <Switch
                checked={dndEnabled}
                onCheckedChange={handleDndToggle}
                disabled={isTogglingDnd}
                data-testid="switch-dnd"
              />
            </div>
          </div>

          <div className={`p-3 rounded-lg ${pushEnabled ? 'bg-green-500/10 border border-green-500/30' : isIOSBrowser ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-900/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className={`w-5 h-5 ${pushEnabled ? 'text-green-400' : isIOSBrowser ? 'text-amber-400' : 'text-slate-400'}`} />
                <div>
                  <p className="text-white font-medium flex items-center gap-2">
                    Call Notifications
                    {pushEnabled && (
                      <Badge className="bg-green-500/20 text-green-400 text-xs">Enabled</Badge>
                    )}
                    {isIOSBrowser && !pushEnabled && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs">Setup Required</Badge>
                    )}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {pushEnabled 
                      ? 'Receive alerts for incoming calls' 
                      : isIOSBrowser
                        ? 'Install app first (see below)'
                        : pushPermission === 'denied' 
                          ? 'Enable in browser settings'
                          : 'Get notified when someone calls'}
                  </p>
                </div>
              </div>
              <Switch
                checked={pushEnabled}
                onCheckedChange={handlePushToggle}
                disabled={isPushLoading || pushPermission === 'denied' || isIOSBrowser}
                data-testid="switch-push-notifications"
              />
            </div>
            {pushEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={sendTestNotification}
                data-testid="button-test-notification"
              >
                Send Test Notification
              </Button>
            )}
          </div>

          {isIOSBrowser && (
            <div className="p-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <Smartphone className="w-5 h-5 text-amber-400 mt-0.5" />
                <div>
                  <p className="text-white font-medium">Install Call Vault on iOS</p>
                  <p className="text-amber-200/80 text-sm mt-1">
                    To receive call notifications when the app is closed:
                  </p>
                  <ol className="text-amber-200/80 text-sm mt-2 space-y-1 list-decimal list-inside">
                    <li>Tap the <span className="font-semibold">Share</span> button (square with arrow)</li>
                    <li>Scroll and tap <span className="font-semibold">"Add to Home Screen"</span></li>
                    <li>Open Call Vault from your home screen</li>
                    <li>Enable notifications in Settings</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {canInstallPwa && (
            <button
              onClick={handleInstallPwa}
              className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg hover:from-blue-500/30 hover:to-purple-500/30 transition-colors"
              data-testid="button-install-pwa"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <p className="text-white font-medium">Install Call Vault</p>
                  <p className="text-slate-400 text-sm">Get the app for better notifications</p>
                </div>
              </div>
              <Badge className="bg-blue-500 text-white">Install</Badge>
            </button>
          )}

          <div className="space-y-2">
            <button
              onClick={startDeviceTest}
              className="w-full flex items-center justify-between p-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors"
              data-testid="button-device-test"
            >
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <p className="text-white font-medium">Pre-Call Device Test</p>
                  <p className="text-slate-500 text-sm">Check camera & microphone</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </button>
            
            <div className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-white font-medium text-sm">Skip before calls</p>
                  <p className="text-slate-500 text-xs">Auto-start calls without device check</p>
                </div>
              </div>
              <Switch
                checked={skipPreCallCheck}
                onCheckedChange={(checked) => {
                  setSkipPreCallCheck(checked);
                  localStorage.setItem('cv_skip_precall_check', checked ? 'true' : 'false');
                  toast.success(checked ? 'Pre-call check disabled' : 'Pre-call check enabled');
                }}
                data-testid="switch-skip-precall"
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
          <div 
            className="flex items-center justify-between p-3 rounded-lg bg-transparent"
          >
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="font-medium text-white">Biometric Lock</p>
                <p className="text-slate-500 text-sm">
                  {isEnrolling ? 'Setting up...' : 
                   settings.biometricLockEnabled ? 'Face ID / Touch ID enabled' :
                   isInIframe() && isIOS() ? 'Tap to enable (may need Safari)' :
                   biometricAvailable ? 'Use Face ID or Touch ID' : 
                   'Not available on this device'}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.biometricLockEnabled}
              onCheckedChange={handleBiometricToggle}
              disabled={isEnrolling}
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
                  {hasFullAccess ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Pro</span>
                  )}
                </p>
                <p className="text-slate-500 text-sm">Accept paid calls & set hours</p>
              </div>
            </div>
            {hasFullAccess ? (
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
                  {hasFullAccess ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Pro</span>
                  )}
                </p>
                <p className="text-slate-500 text-sm">View your call stats & earnings</p>
              </div>
            </div>
            {hasFullAccess ? (
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
              <p className="text-slate-500 text-xs mt-2">
                Your public key identifies you across devices. Add this to FOUNDER_PUBKEYS in Secrets for founder access.
              </p>
              <Button
                onClick={copyPublicKey}
                variant="outline"
                size="sm"
                className="mt-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                data-testid="button-copy-pubkey"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Public Key (for Founder Setup)
              </Button>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Call ID (Your Unique Address)</Label>
              <div className="mt-1 p-3 bg-slate-900/50 rounded-lg font-mono text-xs text-emerald-400 break-all" data-testid="text-call-address">
                {identity.address}
              </div>
              <p className="text-slate-500 text-xs mt-2">
                This is your unique cryptographic address. Share it with others so they can call you.
              </p>
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
            <div className="border-t border-slate-700 pt-4 mt-4">
              <Label className="text-slate-400 text-sm">Backup & Restore Identity</Label>
              <p className="text-slate-500 text-xs mt-1 mb-3">
                Export your identity to back it up, or import a previously exported backup to restore your contacts and call history.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleExportIdentity}
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                  data-testid="button-export-identity"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Backup
                </Button>
                <Button
                  onClick={() => setShowImportDialog(true)}
                  variant="outline"
                  size="sm"
                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                  data-testid="button-import-identity"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Backup
                </Button>
              </div>
            </div>
            <div className="border-t border-slate-700 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-400 text-sm flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  Cloud Sync
                </Label>
                {vaultExists && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Enabled
                  </Badge>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1 mb-3">
                {vaultExists 
                  ? 'Your identity is backed up to the cloud. You can restore it on any device using your PIN.'
                  : 'Enable cloud sync to access your identity from any device. Your data is encrypted with a PIN that only you know.'}
              </p>
              {vaultExists ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-slate-900/50 rounded-lg">
                    <p className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Cloud sync is active
                    </p>
                    {vaultHint && (
                      <p className="text-slate-500 text-xs mt-1">
                        Hint: {vaultHint}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => setShowVaultSetupDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-white"
                    data-testid="button-update-vault-pin"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Update PIN
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowVaultSetupDialog(true)}
                  variant="outline"
                  size="sm"
                  className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
                  data-testid="button-enable-cloud-sync"
                >
                  <Cloud className="w-4 h-4 mr-2" />
                  Enable Cloud Sync
                </Button>
              )}
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

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <LogOut className="w-5 h-5" />
            Sign Out
          </CardTitle>
          <CardDescription className="text-slate-500">
            Sign out from this device to switch identities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm mb-3">
            This will remove your identity from this browser. Make sure you have cloud sync enabled or have exported a backup before signing out.
          </p>
          <Button
            onClick={() => setShowSignOutDialog(true)}
            variant="outline"
            className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
            data-testid="button-sign-out"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
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

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              Import Identity Backup
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Paste your backup text below to restore your identity and access your contacts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <textarea
              value={importBackupText}
              onChange={(e) => setImportBackupText(e.target.value)}
              placeholder="Paste your backup text here..."
              className="w-full h-32 p-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              data-testid="input-import-backup"
            />
            <p className="text-xs text-slate-500">
              Warning: Importing a backup will replace your current identity. Make sure to export your current identity first if you want to keep it.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setShowImportDialog(false);
                  setImportBackupText('');
                }}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                onClick={handleImportIdentity}
                data-testid="button-confirm-import"
              >
                Restore Identity
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVaultSetupDialog} onOpenChange={setShowVaultSetupDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Cloud className="w-5 h-5 text-cyan-400" />
              {vaultExists ? 'Update Cloud Sync PIN' : 'Enable Cloud Sync'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {vaultExists 
                ? 'Create a new PIN to protect your cloud backup.'
                : 'Create a 6+ digit PIN to encrypt your identity. You\'ll need this PIN to restore your identity on other devices.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300 text-sm">PIN (minimum 6 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={vaultPin}
                onChange={(e) => setVaultPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter PIN"
                className="mt-1 bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-vault-pin"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={vaultPinConfirm}
                onChange={(e) => setVaultPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="Re-enter PIN"
                className="mt-1 bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-vault-pin-confirm"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Hint (optional)</Label>
              <Input
                type="text"
                value={vaultPinHint}
                onChange={(e) => setVaultPinHint(e.target.value)}
                placeholder="e.g., Birthday year"
                className="mt-1 bg-slate-900/50 border-slate-600 text-white"
                maxLength={50}
                data-testid="input-vault-hint"
              />
              <p className="text-xs text-slate-500 mt-1">
                This hint will be visible when recovering your identity.
              </p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-amber-400 text-xs">
                <strong>Important:</strong> If you forget your PIN, you cannot recover your identity from the cloud. Make sure to also keep a backup export.
              </p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setShowVaultSetupDialog(false);
                  setVaultPin('');
                  setVaultPinConfirm('');
                  setVaultPinHint('');
                }}
                data-testid="button-cancel-vault-setup"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                onClick={handleCreateVault}
                disabled={isCreatingVault || vaultPin.length < 6 || vaultPin !== vaultPinConfirm}
                data-testid="button-enable-vault"
              >
                {isCreatingVault ? 'Encrypting...' : (vaultExists ? 'Update PIN' : 'Enable Sync')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeviceTest} onOpenChange={(open) => !open && stopDeviceTest()}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-400" />
              Pre-Call Device Test
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Test your camera and microphone before making a call
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {testStream && (
              <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video">
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(el) => {
                    if (el && testStream) {
                      el.srcObject = testStream;
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Video className={`w-5 h-5 ${
                    deviceTestStatus.camera === 'success' ? 'text-green-400' :
                    deviceTestStatus.camera === 'error' ? 'text-red-400' : 'text-slate-400'
                  }`} />
                  <span className="text-white">Camera</span>
                </div>
                <Badge className={
                  deviceTestStatus.camera === 'success' ? 'bg-green-500/20 text-green-400' :
                  deviceTestStatus.camera === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-600'
                }>
                  {deviceTestStatus.camera === 'success' ? 'Working' :
                   deviceTestStatus.camera === 'error' ? 'Not Available' : 'Testing...'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mic className={`w-5 h-5 ${
                    deviceTestStatus.microphone === 'success' ? 'text-green-400' :
                    deviceTestStatus.microphone === 'error' ? 'text-red-400' : 'text-slate-400'
                  }`} />
                  <span className="text-white">Microphone</span>
                </div>
                <Badge className={
                  deviceTestStatus.microphone === 'success' ? 'bg-green-500/20 text-green-400' :
                  deviceTestStatus.microphone === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-600'
                }>
                  {deviceTestStatus.microphone === 'success' ? 'Working' :
                   deviceTestStatus.microphone === 'error' ? 'Not Available' : 'Testing...'}
                </Badge>
              </div>
            </div>

            {(deviceTestStatus.camera === 'error' || deviceTestStatus.microphone === 'error') && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-400 text-sm">
                  Some devices aren't working. Check your browser permissions and make sure your camera/microphone are connected.
                </p>
              </div>
            )}

            <Button 
              onClick={stopDeviceTest}
              className="w-full bg-slate-700 hover:bg-slate-600"
              data-testid="button-close-device-test"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Sign Out
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to sign out from this device?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-amber-400 text-sm">
                <strong>Warning:</strong> Your identity will be removed from this browser. 
                {vaultExists 
                  ? ' You can restore it using Cloud Sync on the welcome screen.'
                  : ' Make sure you have exported a backup first or enabled cloud sync!'}
              </p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => setShowSignOutDialog(false)}
                data-testid="button-cancel-sign-out"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => {
                  localStorage.removeItem('crypto_identity');
                  localStorage.removeItem('user_profile');
                  localStorage.removeItem('app_settings');
                  toast.success('Signed out successfully');
                  window.location.reload();
                }}
                data-testid="button-confirm-sign-out"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
