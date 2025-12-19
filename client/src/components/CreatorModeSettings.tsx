import { useState, useEffect } from 'react';
import { Briefcase, Clock, DollarSign, Link2, ChevronLeft, ChevronRight, Save, Users, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  getCreatorProfile, 
  saveCreatorProfile, 
  getBusinessHoursSettings, 
  saveBusinessHoursSettings,
  getCallPricingSettings,
  saveCallPricingSettings,
  getDefaultBusinessHours,
  getDefaultCallPricing,
  formatPrice
} from '@/lib/policyStorage';
import { toast } from 'sonner';
import type { CreatorProfile, BusinessHours, CallPricing, BusinessCategory, AfterHoursBehavior, PricingMode, CryptoIdentity } from '@shared/types';

interface CreatorModeSettingsProps {
  identity: CryptoIdentity;
  onBack: () => void;
}

const CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'consulting', label: 'Consulting' },
  { value: 'tech', label: 'Technology' },
  { value: 'music', label: 'Music & Entertainment' },
  { value: 'legal', label: 'Legal' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'health', label: 'Health & Wellness' },
  { value: 'education', label: 'Education' },
  { value: 'creative', label: 'Creative Services' },
  { value: 'other', label: 'Other' }
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CreatorModeSettings({ identity, onBack }: CreatorModeSettingsProps) {
  const [activeSection, setActiveSection] = useState<'main' | 'hours' | 'pricing'>('main');
  
  const [profile, setProfile] = useState<CreatorProfile>(() => {
    const stored = getCreatorProfile();
    if (stored) return stored;
    return {
      address: identity.address,
      enabled: false,
      display_name: '',
      bio: '',
      category: 'other' as BusinessCategory,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      created_at: Date.now(),
      updated_at: Date.now()
    };
  });

  const [hours, setHours] = useState<BusinessHours>(() => {
    const stored = getBusinessHoursSettings();
    if (stored) return stored;
    return {
      owner_address: identity.address,
      slots: getDefaultBusinessHours(),
      after_hours_behavior: 'message' as AfterHoursBehavior,
      after_hours_message: "I'm currently offline. Leave a message and I'll get back to you!",
      updated_at: Date.now()
    };
  });

  const [pricing, setPricing] = useState<CallPricing>(() => {
    const stored = getCallPricingSettings();
    if (stored) return stored;
    return getDefaultCallPricing(identity.address);
  });

  const saveProfile = () => {
    const updated = { ...profile, updated_at: Date.now() };
    saveCreatorProfile(updated);
    setProfile(updated);
    toast.success('Profile saved');
  };

  const saveHours = () => {
    const updated = { ...hours, updated_at: Date.now() };
    saveBusinessHoursSettings(updated);
    setHours(updated);
    toast.success('Business hours saved');
  };

  const savePricing = () => {
    const updated = { ...pricing, updated_at: Date.now() };
    saveCallPricingSettings(updated);
    setPricing(updated);
    toast.success('Pricing saved');
  };

  if (activeSection === 'hours') {
    return (
      <div className="p-4 space-y-4 pb-24">
        <button onClick={() => setActiveSection('main')} className="flex items-center gap-2 text-emerald-400 mb-4">
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Business Mode</span>
        </button>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Business Hours
            </CardTitle>
            <CardDescription className="text-slate-400">
              Set when you're available for calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hours.slots.map((slot, idx) => (
              <div key={slot.day} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-lg">
                <Switch
                  checked={slot.enabled}
                  onCheckedChange={(enabled) => {
                    const newSlots = [...hours.slots];
                    newSlots[idx] = { ...slot, enabled };
                    setHours({ ...hours, slots: newSlots });
                  }}
                />
                <span className="w-12 text-white font-medium">{DAYS[slot.day]}</span>
                {slot.enabled && (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={slot.start}
                      onChange={(e) => {
                        const newSlots = [...hours.slots];
                        newSlots[idx] = { ...slot, start: e.target.value };
                        setHours({ ...hours, slots: newSlots });
                      }}
                      className="bg-slate-900/50 border-slate-600 text-white w-28"
                    />
                    <span className="text-slate-400">to</span>
                    <Input
                      type="time"
                      value={slot.end}
                      onChange={(e) => {
                        const newSlots = [...hours.slots];
                        newSlots[idx] = { ...slot, end: e.target.value };
                        setHours({ ...hours, slots: newSlots });
                      }}
                      className="bg-slate-900/50 border-slate-600 text-white w-28"
                    />
                  </div>
                )}
                {!slot.enabled && <span className="text-slate-500 flex-1">Closed</span>}
              </div>
            ))}

            <div className="pt-4 border-t border-slate-700 space-y-3">
              <Label className="text-slate-300">When I'm offline:</Label>
              <Select 
                value={hours.after_hours_behavior} 
                onValueChange={(v) => setHours({ ...hours, after_hours_behavior: v as AfterHoursBehavior })}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="message" className="text-white">Send auto-message</SelectItem>
                  <SelectItem value="paid_only" className="text-white">Allow paid calls only</SelectItem>
                  <SelectItem value="block_request" className="text-white">Block and show request</SelectItem>
                </SelectContent>
              </Select>

              {hours.after_hours_behavior === 'message' && (
                <Textarea
                  value={hours.after_hours_message}
                  onChange={(e) => setHours({ ...hours, after_hours_message: e.target.value })}
                  placeholder="Your auto-reply message..."
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
              )}
            </div>

            <Button onClick={saveHours} className="w-full bg-emerald-500 hover:bg-emerald-600">
              <Save className="w-4 h-4 mr-2" />
              Save Business Hours
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeSection === 'pricing') {
    return (
      <div className="p-4 space-y-4 pb-24">
        <button onClick={() => setActiveSection('main')} className="flex items-center gap-2 text-emerald-400 mb-4">
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Business Mode</span>
        </button>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Paid Calls
            </CardTitle>
            <CardDescription className="text-slate-400">
              Charge for your time on calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
              <div>
                <p className="text-white font-medium">Enable Paid Calls</p>
                <p className="text-slate-500 text-sm">Require payment for calls</p>
              </div>
              <Switch
                checked={pricing.enabled}
                onCheckedChange={(enabled) => setPricing({ ...pricing, enabled })}
              />
            </div>

            {pricing.enabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-300">Pricing Mode</Label>
                  <Select 
                    value={pricing.mode} 
                    onValueChange={(v) => setPricing({ ...pricing, mode: v as PricingMode })}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="per_session" className="text-white">Per session (fixed fee)</SelectItem>
                      <SelectItem value="per_minute" className="text-white">Per minute (metered)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pricing.mode === 'per_session' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Session Price ($)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={(pricing.session_price_cents || 0) / 100}
                        onChange={(e) => setPricing({ ...pricing, session_price_cents: Math.round(parseFloat(e.target.value) * 100) })}
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Duration (min)</Label>
                      <Input
                        type="number"
                        min={5}
                        value={pricing.session_duration_minutes || 15}
                        onChange={(e) => setPricing({ ...pricing, session_duration_minutes: parseInt(e.target.value) })}
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                )}

                {pricing.mode === 'per_minute' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Per Minute ($)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={(pricing.per_minute_price_cents || 0) / 100}
                        onChange={(e) => setPricing({ ...pricing, per_minute_price_cents: Math.round(parseFloat(e.target.value) * 100) })}
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Minimum (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={pricing.minimum_minutes || 5}
                        onChange={(e) => setPricing({ ...pricing, minimum_minutes: parseInt(e.target.value) })}
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Free First Call</p>
                    <p className="text-slate-500 text-sm">New contacts get one free call</p>
                  </div>
                  <Switch
                    checked={pricing.free_first_call}
                    onCheckedChange={(free_first_call) => setPricing({ ...pricing, free_first_call })}
                  />
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <p className="text-emerald-400 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Friends & Family: {pricing.friends_family_addresses.length} people call free
                  </p>
                </div>
              </>
            )}

            <Button onClick={savePricing} className="w-full bg-emerald-500 hover:bg-emerald-600">
              <Save className="w-4 h-4 mr-2" />
              Save Pricing
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 mb-4">
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Business / Creator Mode
          </CardTitle>
          <CardDescription className="text-slate-400">
            Turn your profile into a business page and accept paid calls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/30">
            <div>
              <p className="text-white font-medium">Enable Business Mode</p>
              <p className="text-slate-400 text-sm">Get a public profile and paid call features</p>
            </div>
            <Switch
              checked={profile.enabled}
              onCheckedChange={(enabled) => setProfile({ ...profile, enabled })}
            />
          </div>

          {profile.enabled && (
            <>
              <div className="space-y-2">
                <Label className="text-slate-300">Display Name</Label>
                <Input
                  value={profile.display_name}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  placeholder="Your professional name"
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Bio</Label>
                <Textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Tell people what you do..."
                  className="bg-slate-900/50 border-slate-600 text-white"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Category</Label>
                <Select 
                  value={profile.category} 
                  onValueChange={(v) => setProfile({ ...profile, category: v as BusinessCategory })}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value} className="text-white">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Timezone</Label>
                <Input
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
              </div>

              <Button onClick={saveProfile} className="w-full bg-emerald-500 hover:bg-emerald-600">
                <Save className="w-4 h-4 mr-2" />
                Save Profile
              </Button>

              <div className="border-t border-slate-700 pt-4 space-y-2">
                <button
                  onClick={() => setActiveSection('hours')}
                  className="w-full flex items-center justify-between p-4 bg-slate-900/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <div className="text-left">
                      <p className="text-white font-medium">Business Hours</p>
                      <p className="text-slate-500 text-sm">Set your availability</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>

                <button
                  onClick={() => setActiveSection('pricing')}
                  className="w-full flex items-center justify-between p-4 bg-slate-900/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-green-400" />
                    <div className="text-left">
                      <p className="text-white font-medium">Paid Calls</p>
                      <p className="text-slate-500 text-sm">Charge for your time</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {process.env.NODE_ENV !== 'production' && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-400 text-xs flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Test Mode: Payments are simulated
          </p>
        </div>
      )}
    </div>
  );
}
