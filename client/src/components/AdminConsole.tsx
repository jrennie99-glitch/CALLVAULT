import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, Shield, Clock, Activity, Search, 
  UserX, UserCheck, Crown, Eye, FileText,
  ArrowLeft, RefreshCw, Gift, Link, Copy, Plus, Trash2, Wallet,
  Settings, UserCog, Ban, CheckCircle, AlertTriangle, Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

interface CryptoIdentity {
  address: string;
  publicKeyBase58: string;
  displayName: string | null;
  role: string;
  isDisabled: boolean;
  trialStatus: string | null;
  trialEndAt: string | null;
  trialMinutesRemaining: number | null;
  createdAt: string;
  lastLoginAt: string | null;
  plan: string | null;
  planStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planRenewalAt: string | null;
  isComped: boolean | null;
  status?: string;
  adminExpiresAt?: string | null;
}

interface AdminPermissionsData {
  address: string;
  role: string;
  permissions: string[];
}

interface AdminWithPermissions extends CryptoIdentity {
  effectivePermissions: string[];
  customPermissions: string[];
  permissionsExpireAt?: string | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  ultra_god_admin: { label: 'Ultra Admin', color: 'bg-red-500' },
  super_admin: { label: 'Super Admin', color: 'bg-orange-500' },
  admin: { label: 'Admin', color: 'bg-yellow-500' },
  support: { label: 'Support', color: 'bg-blue-500' },
  founder: { label: 'Founder', color: 'bg-purple-500' },
  user: { label: 'User', color: 'bg-slate-500' },
};

interface UserUsageStats {
  userAddress: string;
  callsStartedToday: number;
  secondsUsedMonth: number;
  relayCalls24h: number;
}

interface AdminStats {
  totalUsers: number;
  activeTrials: number;
  proPlans: number;
  businessPlans: number;
  disabledUsers: number;
  adminCount: number;
}

interface InviteLink {
  id: string;
  code: string;
  createdByAddress: string;
  type: string;
  trialDays: number | null;
  trialMinutes: number | null;
  grantPlan: string | null;
  maxUses: number | null;
  uses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AuditLog {
  id: string;
  actorAddress: string;
  targetAddress: string | null;
  actionType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface CryptoInvoice {
  id: string;
  payTokenId: string;
  recipientCallId: string;
  recipientWallet: string;
  payerCallId: string | null;
  chain: string;
  asset: string;
  amountUsd: number;
  amountAsset: string;
  status: string;
  txHash: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
}

interface AdminConsoleProps {
  identity: {
    address: string;
    publicKeyBase58: string;
    secretKey: Uint8Array;
  };
  onBack: () => void;
}

function generateAdminHeaders(identity: { address: string; secretKey: Uint8Array }) {
  const timestamp = Date.now();
  const message = `admin:${identity.address}:${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, identity.secretKey);
  
  return {
    'x-admin-address': identity.address,
    'x-admin-signature': bs58.encode(signature),
    'x-admin-timestamp': timestamp.toString(),
    'Content-Type': 'application/json',
  };
}

export function AdminConsole({ identity, onBack }: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<CryptoIdentity | null>(null);
  const [trialDays, setTrialDays] = useState('7');
  const [trialMinutes, setTrialMinutes] = useState('30');
  const [chainFilter, setChainFilter] = useState<'all' | 'base' | 'solana'>('all');
  const [trialType, setTrialType] = useState<'days' | 'minutes'>('days');
  const [newInviteDays, setNewInviteDays] = useState('7');
  const [newInviteMinutes, setNewInviteMinutes] = useState('30');
  const [newInvitePlan, setNewInvitePlan] = useState<string>('pro');
  const [newInviteMaxUses, setNewInviteMaxUses] = useState('');
  const [newInviteType, setNewInviteType] = useState<string>('trial');
  const [newInviteExpiry, setNewInviteExpiry] = useState('');
  const [isCreateInviteOpen, setIsCreateInviteOpen] = useState(false);
  
  const [hasAdminCredentials, setHasAdminCredentials] = useState<boolean | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSettingUpCredentials, setIsSettingUpCredentials] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery<{ users: CryptoIdentity[]; total: number }>({
    queryKey: ['admin-users', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '50');
      
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });

  const { data: auditLogs, isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?limit=50', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
  });

  const { data: roleData } = useQuery<{ role: string; isFounder: boolean }>({
    queryKey: ['admin-role', identity.address],
    queryFn: async () => {
      const res = await fetch(`/api/identity/${identity.address}/role`);
      return res.json();
    },
  });

  const { data: inviteLinks, isLoading: invitesLoading, refetch: refetchInvites } = useQuery<InviteLink[]>({
    queryKey: ['admin-invite-links'],
    queryFn: async () => {
      const res = await fetch('/api/admin/invite-links', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch invite links');
      return res.json();
    },
  });

  const { data: cryptoInvoices, isLoading: cryptoLoading, refetch: refetchCrypto } = useQuery<CryptoInvoice[]>({
    queryKey: ['admin-crypto-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/admin/crypto-invoices', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch crypto invoices');
      return res.json();
    },
  });

  interface UsageStatsResponse {
    usageCounters: UserUsageStats[];
    activeCalls: Array<{ callSessionId: string; callerAddress: string; calleeAddress: string; startedAt: string }>;
    summary: {
      totalActiveUsers: number;
      totalActiveCalls: number;
      totalCallsToday: number;
      totalMinutesThisMonth: number;
      totalRelayCallsToday: number;
      turnEnabled: boolean;
      estimatedTurnCostCents: number;
    };
  }

  const { data: usageStats, isLoading: usageLoading, refetch: refetchUsage } = useQuery<UsageStatsResponse>({
    queryKey: ['admin-usage-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/usage-stats', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch usage stats');
      return res.json();
    },
  });

  const { data: myPermissions } = useQuery<AdminPermissionsData>({
    queryKey: ['admin-my-permissions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/me/permissions', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch permissions');
      return res.json();
    },
  });

  interface DiagnosticsData {
    timestamp: string;
    overallStatus: 'ok' | 'warning' | 'error';
    checks: Record<string, {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      error?: string;
      [key: string]: any;
    }>;
  }

  const { data: diagnostics, isLoading: diagnosticsLoading, refetch: refetchDiagnostics } = useQuery<DiagnosticsData>({
    queryKey: ['admin-diagnostics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/diagnostics', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) throw new Error('Failed to fetch diagnostics');
      return res.json();
    },
    enabled: activeTab === 'diagnostics',
  });

  const { data: adminsList, isLoading: adminsLoading, refetch: refetchAdmins } = useQuery<AdminWithPermissions[]>({
    queryKey: ['admin-admins-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/admins', {
        headers: generateAdminHeaders(identity),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: myPermissions?.permissions?.includes('admins.read') || 
             myPermissions?.role === 'ultra_god_admin' || 
             myPermissions?.role === 'founder',
  });

  const canManageAdmins = myPermissions?.permissions?.includes('admins.manage') || 
                          myPermissions?.role === 'ultra_god_admin' ||
                          myPermissions?.role === 'founder';

  const isFounder = roleData?.isFounder ?? false;

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ address, disabled }: { address: string; disabled: boolean }) => {
      const res = await fetch(`/api/admin/users/${address}/status`, {
        method: 'PUT',
        headers: generateAdminHeaders(identity),
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) throw new Error('Failed to update user status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('User status updated');
    },
    onError: () => {
      toast.error('Failed to update user status');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ address, role }: { address: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${address}/role`, {
        method: 'PUT',
        headers: generateAdminHeaders(identity),
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('User role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });

  const grantTrialMutation = useMutation({
    mutationFn: async ({ address, trialDays, trialMinutes }: { address: string; trialDays?: number; trialMinutes?: number }) => {
      const res = await fetch(`/api/admin/users/${address}/trial`, {
        method: 'POST',
        headers: generateAdminHeaders(identity),
        body: JSON.stringify({ trialDays, trialMinutes }),
      });
      if (!res.ok) throw new Error('Failed to grant trial');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Trial granted successfully');
      setSelectedUser(null);
    },
    onError: () => {
      toast.error('Failed to grant trial');
    },
  });

  const createInviteLinkMutation = useMutation({
    mutationFn: async (params: { type: string; trialDays: number; trialMinutes: number; grantPlan: string; maxUses?: number; expiresAt?: string }) => {
      const timestamp = Date.now();
      const message = `admin:create-invite:${identity.address}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, identity.secretKey);
      
      const res = await fetch('/api/admin/invite-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdByAddress: identity.address,
          type: params.type,
          trialDays: params.trialDays,
          trialMinutes: params.trialMinutes,
          grantPlan: params.grantPlan,
          maxUses: params.maxUses || null,
          expiresAt: params.expiresAt || null,
          signature: bs58.encode(signature),
          timestamp,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invite link');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-links'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      toast.success('Invite link created');
      setIsCreateInviteOpen(false);
      // Copy to clipboard
      const inviteUrl = `${window.location.origin}/invite/${data.code}`;
      copyToClipboard(inviteUrl, 'Invite URL copied to clipboard');
    },
    onError: () => {
      toast.error('Failed to create invite link');
    },
  });

  const deactivateInviteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/admin/invite-links/${linkId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorAddress: identity.address }),
      });
      if (!res.ok) throw new Error('Failed to deactivate invite link');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invite-links'] });
      toast.success('Invite link deactivated');
    },
    onError: () => {
      toast.error('Failed to deactivate invite link');
    },
  });

  const setCompedMutation = useMutation({
    mutationFn: async ({ address, isComped }: { address: string; isComped: boolean }) => {
      const res = await fetch(`/api/admin/users/${address}/comped`, {
        method: 'POST',
        headers: generateAdminHeaders(identity),
        body: JSON.stringify({ isComped }),
      });
      if (!res.ok) throw new Error('Failed to update comped status');
      return res.json();
    },
    onSuccess: (_, { isComped }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      toast.success(isComped ? 'User granted perpetual Pro access' : 'Comped status removed');
    },
    onError: () => {
      toast.error('Failed to update comped status');
    },
  });

  const copyInviteLink = (code: string) => {
    const inviteUrl = `${window.location.origin}/invite/${code}`;
    copyToClipboard(inviteUrl, 'Invite URL copied to clipboard');
  };

  const handleCreateInvite = () => {
    createInviteLinkMutation.mutate({
      type: newInviteType,
      trialDays: parseInt(newInviteDays) || 7,
      trialMinutes: parseInt(newInviteMinutes) || 30,
      grantPlan: newInvitePlan,
      maxUses: newInviteMaxUses ? parseInt(newInviteMaxUses) : undefined,
      expiresAt: newInviteExpiry || undefined,
    });
  };

  const handleGrantTrial = () => {
    if (!selectedUser) return;
    
    if (trialType === 'days') {
      grantTrialMutation.mutate({ 
        address: selectedUser.address, 
        trialDays: parseInt(trialDays) 
      });
    } else {
      grantTrialMutation.mutate({ 
        address: selectedUser.address, 
        trialMinutes: parseInt(trialMinutes) 
      });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 20) return address;
    return `${address.slice(0, 12)}...${address.slice(-8)}`;
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'founder':
        return <Badge className="bg-yellow-500"><Crown className="w-3 h-3 mr-1" /> Founder</Badge>;
      case 'admin':
        return <Badge className="bg-blue-500"><Shield className="w-3 h-3 mr-1" /> Admin</Badge>;
      default:
        return <Badge variant="secondary">User</Badge>;
    }
  };

  const getTrialBadge = (user: CryptoIdentity) => {
    if (user.trialStatus === 'active') {
      if (user.trialMinutesRemaining) {
        return <Badge className="bg-green-500"><Clock className="w-3 h-3 mr-1" /> {user.trialMinutesRemaining}m left</Badge>;
      }
      if (user.trialEndAt) {
        return <Badge className="bg-green-500"><Clock className="w-3 h-3 mr-1" /> Active</Badge>;
      }
    }
    if (user.trialStatus === 'expired') {
      return <Badge variant="destructive">Expired</Badge>;
    }
    return null;
  };

  const getPlanBadge = (user: CryptoIdentity) => {
    if (!user.plan || user.plan === 'free') return null;
    
    const planColors: Record<string, string> = {
      pro: 'bg-purple-500',
      business: 'bg-orange-500',
      enterprise: 'bg-amber-500'
    };
    
    const statusIcons: Record<string, string> = {
      active: '',
      past_due: ' (!)' ,
      cancelled: ' (X)'
    };
    
    return (
      <Badge className={planColors[user.plan] || 'bg-slate-500'}>
        {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
        {user.planStatus && statusIcons[user.planStatus]}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-admin-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-lg font-semibold">Admin Console</h1>
        {isFounder && <Badge className="bg-yellow-500 ml-2"><Crown className="w-3 h-3 mr-1" /> Founder</Badge>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
        <TabsList className="grid w-full grid-cols-10 bg-slate-800">
          <TabsTrigger value="dashboard" data-testid="tab-admin-dashboard">
            <Activity className="w-4 h-4 mr-1" /> Stats
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-admin-usage">
            <Clock className="w-4 h-4 mr-1" /> Usage
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-admin-users">
            <Users className="w-4 h-4 mr-1" /> Users
          </TabsTrigger>
          <TabsTrigger value="admins" data-testid="tab-admin-admins">
            <UserCog className="w-4 h-4 mr-1" /> Admins
          </TabsTrigger>
          <TabsTrigger value="invites" data-testid="tab-admin-invites">
            <Link className="w-4 h-4 mr-1" /> Invites
          </TabsTrigger>
          <TabsTrigger value="trials" data-testid="tab-admin-trials">
            <Gift className="w-4 h-4 mr-1" /> Trials
          </TabsTrigger>
          <TabsTrigger value="crypto" data-testid="tab-admin-crypto">
            <Wallet className="w-4 h-4 mr-1" /> Crypto
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-admin-logs">
            <FileText className="w-4 h-4 mr-1" /> Logs
          </TabsTrigger>
          <TabsTrigger value="diagnostics" data-testid="tab-admin-diagnostics">
            <Stethoscope className="w-4 h-4 mr-1" /> Health
          </TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-admin-account">
            <Settings className="w-4 h-4 mr-1" /> Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          {statsLoading ? (
            <div className="text-center py-8 text-slate-400">Loading stats...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white" data-testid="text-total-users">
                    {stats?.totalUsers ?? 0}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Active Trials</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-400" data-testid="text-active-trials">
                    {stats?.activeTrials ?? 0}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Pro Plans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-400" data-testid="text-pro-plans">
                    {stats?.proPlans ?? 0}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Business Plans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-400" data-testid="text-business-plans">
                    {stats?.businessPlans ?? 0}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Disabled Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-400" data-testid="text-disabled-users">
                    {stats?.disabledUsers ?? 0}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Admins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-400" data-testid="text-admin-count">
                    {stats?.adminCount ?? 0}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Usage Dashboard</h2>
            <Button variant="ghost" size="sm" onClick={() => refetchUsage()} data-testid="button-refresh-usage">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
          
          {usageLoading ? (
            <div className="text-center py-8 text-slate-400">Loading usage stats...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Active Calls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-400" data-testid="text-active-calls">
                      {usageStats?.summary?.totalActiveCalls ?? 0}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Calls Today</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-400" data-testid="text-calls-today">
                      {usageStats?.summary?.totalCallsToday ?? 0}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Minutes This Month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-400" data-testid="text-minutes-month">
                      {usageStats?.summary?.totalMinutesThisMonth ?? 0}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Relay Calls (24h)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-400" data-testid="text-relay-calls">
                      {usageStats?.summary?.totalRelayCallsToday ?? 0}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Estimated Costs
                    {usageStats?.summary?.turnEnabled ? (
                      <Badge className="bg-green-600">TURN Enabled</Badge>
                    ) : (
                      <Badge variant="outline">TURN Disabled</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-400" data-testid="text-estimated-cost">
                    ${((usageStats?.summary?.estimatedTurnCostCents ?? 0) / 100).toFixed(2)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Based on ~$0.02 per relay call. Actual costs may vary.
                  </p>
                </CardContent>
              </Card>

              {usageStats?.activeCalls && usageStats.activeCalls.length > 0 && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm">Active Calls Right Now</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {usageStats.activeCalls.map((call) => (
                      <div key={call.callSessionId} className="flex items-center gap-2 text-sm p-2 bg-slate-700 rounded">
                        <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                        <span className="font-mono text-xs">{truncateAddress(call.callerAddress)}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-mono text-xs">{truncateAddress(call.calleeAddress)}</span>
                        <span className="ml-auto text-slate-400 text-xs">{formatDate(call.startedAt)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {usageStats?.usageCounters && usageStats.usageCounters.length > 0 && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm">Recent User Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left py-2">User</th>
                            <th className="text-right py-2">Calls Today</th>
                            <th className="text-right py-2">Min This Mo</th>
                            <th className="text-right py-2">Relay 24h</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usageStats.usageCounters.slice(0, 20).map((counter) => (
                            <tr key={counter.userAddress} className="border-b border-slate-700/50">
                              <td className="py-2 font-mono text-xs">{truncateAddress(counter.userAddress)}</td>
                              <td className="text-right py-2">{counter.callsStartedToday}</td>
                              <td className="text-right py-2">{Math.floor((counter.secondsUsedMonth || 0) / 60)}</td>
                              <td className="text-right py-2">{counter.relayCalls24h}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by address or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
                data-testid="input-user-search"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetchUsers()} data-testid="button-refresh-users">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {usersLoading ? (
            <div className="text-center py-8 text-slate-400">Loading users...</div>
          ) : (
            <div className="space-y-2">
              {usersData?.users.map((user) => (
                <Card key={user.address} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm" data-testid={`text-user-address-${user.address.slice(0, 8)}`}>
                            {truncateAddress(user.address)}
                          </span>
                          {getRoleBadge(user.role)}
                          {getPlanBadge(user)}
                          {getTrialBadge(user)}
                          {user.isComped && <Badge className="bg-emerald-600">Comped</Badge>}
                          {user.isDisabled && <Badge variant="destructive"><UserX className="w-3 h-3 mr-1" /> Disabled</Badge>}
                        </div>
                        {user.displayName && (
                          <div className="text-slate-400 text-sm mt-1">{user.displayName}</div>
                        )}
                        <div className="text-slate-500 text-xs mt-1">
                          Joined: {formatDate(user.createdAt)}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleUserStatusMutation.mutate({ 
                            address: user.address, 
                            disabled: !user.isDisabled 
                          })}
                          data-testid={`button-toggle-status-${user.address.slice(0, 8)}`}
                        >
                          {user.isDisabled ? <UserCheck className="w-4 h-4 text-green-400" /> : <UserX className="w-4 h-4 text-red-400" />}
                        </Button>
                        
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                              data-testid={`button-grant-trial-${user.address.slice(0, 8)}`}
                            >
                              <Gift className="w-4 h-4 text-green-400" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-slate-800 border-slate-700">
                            <DialogHeader>
                              <DialogTitle>Grant Trial Access</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="text-sm text-slate-400">
                                User: {truncateAddress(selectedUser?.address || '')}
                              </div>
                              
                              <Select value={trialType} onValueChange={(v) => setTrialType(v as 'days' | 'minutes')}>
                                <SelectTrigger className="bg-slate-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="days">Days</SelectItem>
                                  <SelectItem value="minutes">Minutes</SelectItem>
                                </SelectContent>
                              </Select>
                              
                              {trialType === 'days' ? (
                                <Input
                                  type="number"
                                  value={trialDays}
                                  onChange={(e) => setTrialDays(e.target.value)}
                                  placeholder="Number of days"
                                  className="bg-slate-700"
                                  data-testid="input-trial-days"
                                />
                              ) : (
                                <Input
                                  type="number"
                                  value={trialMinutes}
                                  onChange={(e) => setTrialMinutes(e.target.value)}
                                  placeholder="Number of minutes"
                                  className="bg-slate-700"
                                  data-testid="input-trial-minutes"
                                />
                              )}
                              
                              <Button 
                                onClick={handleGrantTrial} 
                                className="w-full"
                                disabled={grantTrialMutation.isPending}
                                data-testid="button-confirm-grant-trial"
                              >
                                {grantTrialMutation.isPending ? 'Granting...' : 'Grant Trial'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCompedMutation.mutate({ 
                            address: user.address, 
                            isComped: !user.isComped 
                          })}
                          title={user.isComped ? 'Remove perpetual Pro access' : 'Grant perpetual Pro access'}
                          data-testid={`button-toggle-comped-${user.address.slice(0, 8)}`}
                        >
                          <Crown className={`w-4 h-4 ${user.isComped ? 'text-emerald-400' : 'text-slate-400'}`} />
                        </Button>

                        {isFounder && user.role !== 'founder' && (
                          <Select
                            value={user.role}
                            onValueChange={(role) => updateRoleMutation.mutate({ address: user.address, role })}
                          >
                            <SelectTrigger className="w-24 bg-slate-700 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="founder">Founder</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {usersData?.users.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  No users found
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="admins" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Admin Management</h2>
            <Button variant="outline" size="icon" onClick={() => refetchAdmins()} data-testid="button-refresh-admins">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Your Permissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge className={ROLE_LABELS[myPermissions?.role || 'user']?.color || 'bg-slate-500'}>
                  {ROLE_LABELS[myPermissions?.role || 'user']?.label || myPermissions?.role}
                </Badge>
                {myPermissions?.permissions?.map((perm) => (
                  <Badge key={perm} variant="outline" className="text-xs">
                    {perm}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {adminsLoading ? (
            <div className="text-center py-8 text-slate-400">Loading admins...</div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm text-slate-400">All Administrators</h3>
              {adminsList?.map((admin) => (
                <Card key={admin.address} className="bg-slate-800 border-slate-700">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{admin.displayName || admin.address.slice(0, 20)}...</span>
                          <Badge className={ROLE_LABELS[admin.role]?.color || 'bg-slate-500'}>
                            {ROLE_LABELS[admin.role]?.label || admin.role}
                          </Badge>
                          {admin.status === 'suspended' && (
                            <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" /> Suspended</Badge>
                          )}
                          {admin.adminExpiresAt && new Date(admin.adminExpiresAt) < new Date() && (
                            <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Expired
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {admin.effectivePermissions?.slice(0, 5).map((perm) => (
                            <Badge key={perm} variant="outline" className="text-xs text-slate-400">
                              {perm}
                            </Badge>
                          ))}
                          {admin.effectivePermissions?.length > 5 && (
                            <Badge variant="outline" className="text-xs text-slate-400">
                              +{admin.effectivePermissions.length - 5} more
                            </Badge>
                          )}
                        </div>
                        {admin.adminExpiresAt && (
                          <p className="text-xs text-slate-500 mt-1">
                            Expires: {new Date(admin.adminExpiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {canManageAdmins && admin.address !== identity.address && (
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              if (confirm('Remove admin role from this user?')) {
                                fetch(`/api/admin/admins/${admin.address}`, {
                                  method: 'DELETE',
                                  headers: generateAdminHeaders(identity),
                                }).then(() => {
                                  refetchAdmins();
                                  toast.success('Admin role revoked');
                                }).catch(() => toast.error('Failed to revoke admin'));
                              }
                            }}
                            title="Revoke Admin"
                            data-testid={`button-revoke-admin-${admin.address.slice(0, 8)}`}
                          >
                            <UserX className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!adminsList || adminsList.length === 0) && (
                <div className="text-center py-8 text-slate-400">
                  No admins found or insufficient permissions to view
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invites" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Invite Links</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => refetchInvites()} data-testid="button-refresh-invites">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Dialog open={isCreateInviteOpen} onOpenChange={setIsCreateInviteOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-invite">
                    <Plus className="w-4 h-4 mr-2" /> Create Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700">
                  <DialogHeader>
                    <DialogTitle>Create Invite Link</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Invite Type</label>
                      <Select value={newInviteType} onValueChange={setNewInviteType}>
                        <SelectTrigger className="bg-slate-700" data-testid="select-invite-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial (limited access)</SelectItem>
                          <SelectItem value="comp">Comp (full access, no billing)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">
                        {newInviteType === 'trial' ? 'Recipients get limited trial minutes' : 'Recipients get full plan access without payment'}
                      </p>
                    </div>
                    {newInviteType === 'trial' && (
                      <>
                        <div>
                          <label className="text-sm text-slate-400 mb-1 block">Trial Days</label>
                          <Input
                            type="number"
                            value={newInviteDays}
                            onChange={(e) => setNewInviteDays(e.target.value)}
                            placeholder="7"
                            className="bg-slate-700"
                            data-testid="input-invite-days"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-400 mb-1 block">Trial Minutes</label>
                          <Input
                            type="number"
                            value={newInviteMinutes}
                            onChange={(e) => setNewInviteMinutes(e.target.value)}
                            placeholder="30"
                            className="bg-slate-700"
                            data-testid="input-invite-minutes"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Grant Plan</label>
                      <Select value={newInvitePlan} onValueChange={setNewInvitePlan}>
                        <SelectTrigger className="bg-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Max Uses (optional)</label>
                      <Input
                        type="number"
                        value={newInviteMaxUses}
                        onChange={(e) => setNewInviteMaxUses(e.target.value)}
                        placeholder="Unlimited"
                        className="bg-slate-700"
                        data-testid="input-invite-max-uses"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Link Expiration (optional)</label>
                      <Input
                        type="date"
                        value={newInviteExpiry}
                        onChange={(e) => setNewInviteExpiry(e.target.value)}
                        className="bg-slate-700"
                        data-testid="input-invite-expiry"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <Button 
                      onClick={handleCreateInvite} 
                      className="w-full"
                      disabled={createInviteLinkMutation.isPending}
                      data-testid="button-confirm-create-invite"
                    >
                      {createInviteLinkMutation.isPending ? 'Creating...' : 'Create & Copy Link'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {invitesLoading ? (
            <div className="text-center py-8 text-slate-400">Loading invite links...</div>
          ) : inviteLinks?.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="py-8 text-center text-slate-400">
                <Link className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No invite links yet</p>
                <p className="text-sm mt-2">Create invite links to onboard influencers with free trials</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {inviteLinks?.map((link) => (
                <Card key={link.id} className={`bg-slate-800 border-slate-700 ${!link.isActive ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono bg-slate-700 px-2 py-1 rounded" data-testid={`text-invite-code-${link.code}`}>
                            {link.code}
                          </code>
                          <Badge variant={link.isActive ? "default" : "destructive"}>
                            {link.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant={link.type === 'comp' ? "secondary" : "outline"} className="capitalize">
                            {link.type === 'comp' ? 'Comp' : 'Trial'}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {link.grantPlan || 'pro'}
                          </Badge>
                        </div>
                        <div className="text-slate-400 text-sm mt-2">
                          {link.type !== 'comp' && (
                            <span>{link.trialDays}d + {link.trialMinutes}min trial · </span>
                          )}
                          {link.maxUses && <span>Max {link.maxUses} uses · </span>}
                          <span>Used {link.uses || 0}x</span>
                          {link.expiresAt && (
                            <span> · Expires {new Date(link.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          Created: {formatDate(link.createdAt)}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyInviteLink(link.code)}
                          disabled={!link.isActive}
                          data-testid={`button-copy-invite-${link.code}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {link.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deactivateInviteLinkMutation.mutate(link.id)}
                            data-testid={`button-deactivate-invite-${link.code}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trials" className="mt-4 space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Active Trials</CardTitle>
            </CardHeader>
            <CardContent>
              {usersData?.users.filter(u => u.trialStatus === 'active').length === 0 ? (
                <div className="text-slate-400 text-center py-4">No active trials</div>
              ) : (
                <div className="space-y-2">
                  {usersData?.users.filter(u => u.trialStatus === 'active').map((user) => (
                    <div key={user.address} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                      <div>
                        <div className="font-mono text-sm">{truncateAddress(user.address)}</div>
                        {user.displayName && <div className="text-slate-400 text-xs">{user.displayName}</div>}
                      </div>
                      <div className="text-right">
                        {user.trialMinutesRemaining ? (
                          <div className="text-green-400">{user.trialMinutesRemaining} minutes left</div>
                        ) : user.trialEndAt ? (
                          <div className="text-green-400">Expires: {formatDate(user.trialEndAt)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Expired Trials</CardTitle>
            </CardHeader>
            <CardContent>
              {usersData?.users.filter(u => u.trialStatus === 'expired').length === 0 ? (
                <div className="text-slate-400 text-center py-4">No expired trials</div>
              ) : (
                <div className="space-y-2">
                  {usersData?.users.filter(u => u.trialStatus === 'expired').map((user) => (
                    <div key={user.address} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                      <div>
                        <div className="font-mono text-sm">{truncateAddress(user.address)}</div>
                        {user.displayName && <div className="text-slate-400 text-xs">{user.displayName}</div>}
                      </div>
                      <Badge variant="destructive">Expired</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crypto" className="mt-4 space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5 text-orange-400" />
                Crypto Invoices
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={chainFilter} onValueChange={(v) => setChainFilter(v as typeof chainFilter)}>
                  <SelectTrigger className="w-24 h-8 text-xs" data-testid="select-chain-filter">
                    <SelectValue placeholder="Chain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="solana">Solana</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchCrypto()}
                  data-testid="button-refresh-crypto"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cryptoLoading ? (
                <div className="text-center py-4 text-slate-400">Loading invoices...</div>
              ) : !cryptoInvoices || cryptoInvoices.length === 0 ? (
                <div className="text-slate-400 text-center py-4">No crypto invoices yet</div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {cryptoInvoices
                    .filter(inv => chainFilter === 'all' || inv.chain === chainFilter)
                    .map((invoice) => (
                    <div key={invoice.id} className="p-3 bg-slate-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge 
                            className={
                              invoice.status === 'paid' ? 'bg-green-500' :
                              invoice.status === 'pending' ? 'bg-yellow-500' :
                              invoice.status === 'expired' ? 'bg-slate-500' : 'bg-red-500'
                            }
                          >
                            {invoice.status}
                          </Badge>
                          <Badge variant="outline" className={invoice.chain === 'solana' ? 'border-purple-500 text-purple-400' : 'border-blue-500 text-blue-400'}>
                            {invoice.chain}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(invoice.createdAt)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400">Amount:</span>
                          <span className="text-white ml-1 font-medium">
                            {invoice.amountAsset} {invoice.asset}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">USD:</span>
                          <span className="text-white ml-1">${invoice.amountUsd.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Asset:</span>
                          <span className="text-white ml-1">{invoice.asset}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Recipient:</span>
                          <span className="text-white ml-1 font-mono text-[10px]">
                            {invoice.recipientWallet.slice(0, 6)}...{invoice.recipientWallet.slice(-4)}
                          </span>
                        </div>
                      </div>
                      {invoice.txHash && (
                        <div className="mt-2 pt-2 border-t border-slate-600">
                          <span className="text-slate-400 text-xs">Tx: </span>
                          <a
                            href={invoice.chain === 'solana' 
                              ? `https://solscan.io/tx/${invoice.txHash}` 
                              : `https://basescan.org/tx/${invoice.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs font-mono"
                          >
                            {invoice.txHash.slice(0, 10)}...{invoice.txHash.slice(-8)}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4 space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Audit Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="text-center py-4 text-slate-400">Loading logs...</div>
              ) : auditLogs?.length === 0 ? (
                <div className="text-slate-400 text-center py-4">No audit logs yet</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {auditLogs?.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{log.actionType}</Badge>
                        <span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        <div>Actor: {truncateAddress(log.actorAddress)}</div>
                        {log.targetAddress && <div>Target: {truncateAddress(log.targetAddress)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">System Diagnostics</h2>
            <Button variant="ghost" size="sm" onClick={() => refetchDiagnostics()} data-testid="button-refresh-diagnostics">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>

          {diagnosticsLoading ? (
            <div className="text-center py-8 text-slate-400">Running diagnostics...</div>
          ) : diagnostics ? (
            <>
              <Card className={`border-2 ${
                diagnostics.overallStatus === 'ok' ? 'bg-green-900/20 border-green-500' :
                diagnostics.overallStatus === 'warning' ? 'bg-yellow-900/20 border-yellow-500' :
                'bg-red-900/20 border-red-500'
              }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {diagnostics.overallStatus === 'ok' && <CheckCircle className="w-5 h-5 text-green-400" />}
                    {diagnostics.overallStatus === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-400" />}
                    {diagnostics.overallStatus === 'error' && <Ban className="w-5 h-5 text-red-400" />}
                    Overall Status: {diagnostics.overallStatus.toUpperCase()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-slate-400">
                    Last checked: {new Date(diagnostics.timestamp).toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(diagnostics.checks).map(([key, check]) => (
                  <Card key={key} className="bg-slate-800 border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {check.status === 'ok' && <CheckCircle className="w-4 h-4 text-green-400" />}
                        {check.status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                        {check.status === 'error' && <Ban className="w-4 h-4 text-red-400" />}
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {check.message && (
                        <div className="text-sm text-slate-300 mb-2">{check.message}</div>
                      )}
                      {check.error && (
                        <div className="text-sm text-red-400 mb-2">{check.error}</div>
                      )}
                      {check.userCount !== undefined && (
                        <div className="text-xs text-slate-400">Users: {check.userCount}</div>
                      )}
                      {check.count !== undefined && (
                        <div className="text-xs text-slate-400">Count: {check.count}</div>
                      )}
                      {check.details && (
                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                          {Object.entries(check.details).map(([k, v]) => (
                            <div key={k}>
                              {k}: {v ? '✓' : '✗'}
                            </div>
                          ))}
                        </div>
                      )}
                      {check.limits && (
                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                          {Object.entries(check.limits).map(([k, v]) => (
                            <div key={k}>
                              {k.replace(/([A-Z])/g, ' $1')}: {String(v)}
                            </div>
                          ))}
                        </div>
                      )}
                      {check.events && check.events.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          {check.events.map((event: any, idx: number) => (
                            <div key={idx} className="text-xs text-slate-400 py-1 border-b border-slate-600 last:border-0">
                              <Badge variant="outline" className="mr-1 text-xs">{event.action}</Badge>
                              <span className="text-slate-500">{new Date(event.time).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-slate-400">
              Click refresh to run system diagnostics
            </div>
          )}
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Admin Login Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasAdminCredentials === null ? (
                <div className="text-center py-4">
                  <Button 
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/admin/credentials/${identity.address}`, {
                          headers: generateAdminHeaders(identity),
                        });
                        setHasAdminCredentials(res.ok);
                      } catch {
                        setHasAdminCredentials(false);
                      }
                    }}
                    data-testid="button-check-credentials"
                  >
                    Check Credentials Status
                  </Button>
                </div>
              ) : hasAdminCredentials ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
                    <p className="text-green-400 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      You have admin login credentials set up
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      You can log in to the Admin Console at /admin/login using your username and password.
                    </p>
                  </div>
                  
                  <div className="border-t border-slate-700 pt-4">
                    <h3 className="font-medium mb-3">Change Password</h3>
                    <div className="space-y-3">
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-slate-700 border-slate-600"
                        data-testid="input-current-password"
                      />
                      <Input
                        type="password"
                        placeholder="New password (min 8 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-slate-700 border-slate-600"
                        data-testid="input-new-password"
                      />
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-slate-700 border-slate-600"
                        data-testid="input-confirm-password"
                      />
                      <Button
                        onClick={async () => {
                          if (newPassword !== confirmPassword) {
                            toast.error('Passwords do not match');
                            return;
                          }
                          if (newPassword.length < 8) {
                            toast.error('Password must be at least 8 characters');
                            return;
                          }
                          setIsChangingPassword(true);
                          try {
                            const sessionToken = localStorage.getItem('adminSession');
                            const res = await fetch('/api/admin/change-password', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'x-admin-session': sessionToken || '',
                              },
                              body: JSON.stringify({
                                currentPassword,
                                newPassword
                              }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              toast.success('Password changed successfully');
                              setCurrentPassword('');
                              setNewPassword('');
                              setConfirmPassword('');
                            } else {
                              toast.error(data.error || 'Failed to change password');
                            }
                          } catch {
                            toast.error('Failed to change password');
                          } finally {
                            setIsChangingPassword(false);
                          }
                        }}
                        disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                        data-testid="button-change-password"
                      >
                        {isChangingPassword ? 'Changing...' : 'Change Password'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                    <p className="text-yellow-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      No login credentials set up
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      Set up a username and password to access the Admin Console without your cryptographic keys.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="Choose a username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="bg-slate-700 border-slate-600"
                      autoComplete="off"
                      data-testid="input-setup-username"
                    />
                    <Input
                      type="password"
                      placeholder="Choose a password (min 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600"
                      data-testid="input-setup-password"
                    />
                    <Input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600"
                      data-testid="input-setup-confirm-password"
                    />
                    <Button
                      onClick={async () => {
                        if (newPassword !== confirmPassword) {
                          toast.error('Passwords do not match');
                          return;
                        }
                        if (newPassword.length < 8) {
                          toast.error('Password must be at least 8 characters');
                          return;
                        }
                        if (!newUsername || newUsername.length < 3) {
                          toast.error('Username must be at least 3 characters');
                          return;
                        }
                        setIsSettingUpCredentials(true);
                        try {
                          const timestamp = Date.now();
                          const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
                          const payload = { 
                            action: 'setup_admin_credentials', 
                            address: identity.address, 
                            timestamp, 
                            nonce,
                            username: newUsername 
                          };
                          const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
                          const signature = nacl.sign.detached(payloadBytes, identity.secretKey);
                          
                          const res = await fetch('/api/admin/setup-credentials', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              address: identity.address,
                              publicKey: identity.publicKeyBase58,
                              signature: bs58.encode(signature),
                              timestamp,
                              nonce,
                              username: newUsername,
                              password: newPassword
                            }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            toast.success('Admin credentials created successfully');
                            setHasAdminCredentials(true);
                            setNewUsername('');
                            setNewPassword('');
                            setConfirmPassword('');
                          } else {
                            toast.error(data.error || 'Failed to create credentials');
                          }
                        } catch {
                          toast.error('Failed to create credentials');
                        } finally {
                          setIsSettingUpCredentials(false);
                        }
                      }}
                      disabled={isSettingUpCredentials || !newUsername || !newPassword || !confirmPassword}
                      className="w-full"
                      data-testid="button-setup-credentials"
                    >
                      {isSettingUpCredentials ? 'Setting up...' : 'Create Admin Login'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Admin Login Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 mb-4">
                Access the Admin Console using username/password authentication at:
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-slate-900 px-3 py-2 rounded text-emerald-400 flex-1">
                  {window.location.origin}/admin/login
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    copyToClipboard(`${window.location.origin}/admin/login`, 'Link copied');
                  }}
                  data-testid="button-copy-admin-login-url"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
