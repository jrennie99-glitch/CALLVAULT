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
  ArrowLeft, RefreshCw, Gift
} from 'lucide-react';
import { toast } from 'sonner';
import * as nacl from 'tweetnacl';
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
}

interface AdminStats {
  totalUsers: number;
  activeTrials: number;
  disabledUsers: number;
  admins: number;
}

interface AuditLog {
  id: string;
  actorAddress: string;
  targetAddress: string | null;
  actionType: string;
  metadata: Record<string, unknown>;
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
  const [trialType, setTrialType] = useState<'days' | 'minutes'>('days');
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
        <TabsList className="grid w-full grid-cols-4 bg-slate-800">
          <TabsTrigger value="dashboard" data-testid="tab-admin-dashboard">
            <Activity className="w-4 h-4 mr-2" /> Stats
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-admin-users">
            <Users className="w-4 h-4 mr-2" /> Users
          </TabsTrigger>
          <TabsTrigger value="trials" data-testid="tab-admin-trials">
            <Gift className="w-4 h-4 mr-2" /> Trials
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-admin-logs">
            <FileText className="w-4 h-4 mr-2" /> Logs
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
                    {stats?.admins ?? 0}
                  </div>
                </CardContent>
              </Card>
            </div>
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
                          {getTrialBadge(user)}
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
      </Tabs>
    </div>
  );
}
