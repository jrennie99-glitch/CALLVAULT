import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Phone, Clock, TrendingUp, ChevronLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CreatorStats {
  totalCalls: number;
  totalMinutes: number;
  totalEarnings: number;
  paidCalls: number;
}

interface CallSession {
  id: string;
  callerAddress: string;
  callType: string;
  status: string;
  startedAt: string;
  durationSeconds?: number;
  isPaid: boolean;
  amountPaid?: number;
}

interface EarningsDashboardProps {
  creatorAddress: string;
  onBack: () => void;
}

export function EarningsDashboard({ creatorAddress, onBack }: EarningsDashboardProps) {
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, callsRes] = await Promise.all([
        fetch(`/api/earnings/${encodeURIComponent(creatorAddress)}/stats`),
        fetch(`/api/calls/${encodeURIComponent(creatorAddress)}?limit=10`)
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setRecentCalls(callsData);
      }
    } catch (error) {
      console.error('Error fetching earnings data:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [creatorAddress]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-semibold">Earnings Dashboard</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4" data-testid="earnings-dashboard">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-semibold">Earnings Dashboard</h1>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          disabled={refreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-sm text-slate-400">Total Earnings</span>
            </div>
            <p className="text-2xl font-bold text-green-400" data-testid="text-total-earnings">
              {formatCurrency(stats?.totalEarnings || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-slate-400">Total Calls</span>
            </div>
            <p className="text-2xl font-bold text-white" data-testid="text-total-calls">
              {stats?.totalCalls || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-slate-400">Total Minutes</span>
            </div>
            <p className="text-2xl font-bold text-white" data-testid="text-total-minutes">
              {stats?.totalMinutes || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-slate-400">Paid Calls</span>
            </div>
            <p className="text-2xl font-bold text-white" data-testid="text-paid-calls">
              {stats?.paidCalls || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No calls yet</p>
              <p className="text-sm">Your call history will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div 
                  key={call.id} 
                  className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                  data-testid={`call-item-${call.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {call.callerAddress.slice(0, 20)}...
                    </p>
                    <p className="text-xs text-slate-400">
                      {call.callType === 'video' ? 'Video' : 'Voice'} call • {formatDate(call.startedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    {call.durationSeconds && (
                      <p className="text-sm">{formatDuration(call.durationSeconds)}</p>
                    )}
                    {call.isPaid && call.amountPaid && (
                      <p className="text-xs text-green-400">{formatCurrency(call.amountPaid)}</p>
                    )}
                    {!call.isPaid && (
                      <span className="text-xs bg-slate-600 px-2 py-0.5 rounded">Free</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>• Share your profile link to attract more callers</p>
          <p>• Set competitive pricing based on your expertise</p>
          <p>• Keep your business hours updated for availability</p>
          <p>• Respond promptly to build your reputation</p>
        </CardContent>
      </Card>
    </div>
  );
}
