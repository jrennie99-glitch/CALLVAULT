import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Phone, Video, Clock, DollarSign, CheckCircle, AlertCircle, ArrowLeft, Briefcase, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/Avatar';
import { formatPrice, getCreatorProfile, getBusinessHoursSettings, getCallPricingSettings } from '@/lib/policyStorage';
import type { CreatorProfile, CallPricing, BusinessHours } from '@shared/types';

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [pricing, setPricing] = useState<CallPricing | null>(null);
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = () => {
      const storedProfile = getCreatorProfile();
      const storedPricing = getCallPricingSettings();
      const storedHours = getBusinessHoursSettings();
      
      if (storedProfile && storedProfile.enabled) {
        const profileHandle = storedProfile.handle || storedProfile.address.slice(5, 15);
        if (profileHandle === handle || storedProfile.address.includes(handle || '')) {
          setProfile(storedProfile);
          setPricing(storedPricing);
          setHours(storedHours);
          
          if (storedHours) {
            const now = new Date();
            const todaySlot = storedHours.slots.find(s => s.day === now.getDay());
            if (todaySlot && todaySlot.enabled) {
              const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
              setIsAvailable(currentTime >= todaySlot.start && currentTime <= todaySlot.end);
            } else {
              setIsAvailable(false);
            }
          }
        }
      }
      setLoading(false);
    };
    loadProfile();
  }, [handle]);

  const handleFreeCall = () => {
    if (profile) {
      window.location.href = `/?call=${encodeURIComponent(profile.address)}&video=true`;
    }
  };

  const handlePaidCall = () => {
    if (profile) {
      window.location.href = `/pay/${profile.address}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center text-center p-6">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
        <p className="text-slate-400 mb-6">This business profile doesn't exist or has been removed.</p>
        <Button onClick={() => window.location.href = '/'} variant="outline" className="border-slate-600">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Home
        </Button>
      </div>
    );
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().getDay();
  const todaySlot = hours?.slots.find(s => s.day === today);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-md mx-auto p-6 pb-32">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="mb-4">
            <Avatar address={profile.address} size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{profile.display_name}</h1>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full">
              {profile.category}
            </span>
            {profile.wallet_verified && (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Verified
              </span>
            )}
          </div>
          {profile.bio && (
            <p className="text-slate-400 text-sm max-w-xs">{profile.bio}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-3 h-3 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className={isAvailable ? 'text-emerald-400' : 'text-slate-400'}>
            {isAvailable ? 'Available now' : 'Offline — paid calls only'}
          </span>
        </div>

        {pricing?.enabled && (
          <Card className="bg-slate-800/50 border-slate-700 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-purple-400" />
                <span className="text-white font-medium">Call Pricing</span>
              </div>
              <div className="text-slate-300">
                {pricing.mode === 'per_session' ? (
                  <p>{formatPrice(pricing.session_price_cents || 0)} / {pricing.session_duration_minutes} min session</p>
                ) : (
                  <p>{formatPrice(pricing.per_minute_price_cents || 0)} / minute (min {pricing.minimum_minutes} min)</p>
                )}
                {pricing.free_first_call && (
                  <p className="text-emerald-400 text-sm mt-1">First call free for new contacts</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {hours && (
          <Card className="bg-slate-800/50 border-slate-700 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span className="text-white font-medium">Business Hours</span>
              </div>
              <div className="space-y-1 text-sm">
                {hours.slots.map(slot => (
                  <div key={slot.day} className={`flex justify-between ${slot.day === today ? 'text-emerald-400' : 'text-slate-400'}`}>
                    <span>{DAYS[slot.day]}</span>
                    <span>{slot.enabled ? `${slot.start} - ${slot.end}` : 'Closed'}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
          <div className="max-w-md mx-auto flex gap-3">
            {(!pricing?.enabled || pricing.free_first_call) && (
              <Button
                onClick={handleFreeCall}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                data-testid="button-free-call"
              >
                <Video className="w-4 h-4 mr-2" />
                Request Free Call
              </Button>
            )}
            {pricing?.enabled && (
              <Button
                onClick={handlePaidCall}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                data-testid="button-paid-call"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Book Paid Call
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
