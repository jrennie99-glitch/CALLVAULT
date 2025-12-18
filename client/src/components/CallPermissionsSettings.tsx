import { useState, useEffect } from 'react';
import { Shield, Users, Lock, Bell, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getLocalPolicy, saveLocalPolicy, getDefaultPolicy, getLocalRoutingRules, saveLocalRoutingRules } from '@/lib/policyStorage';
import { toast } from 'sonner';
import type { CallPolicy, RoutingRule, AllowCallsFrom, UnknownCallerBehavior, CryptoIdentity } from '@shared/types';
import * as cryptoLib from '@/lib/crypto';

interface CallPermissionsSettingsProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack: () => void;
}

export function CallPermissionsSettings({ identity, ws, onBack }: CallPermissionsSettingsProps) {
  const [policy, setPolicy] = useState<CallPolicy>(() => {
    const stored = getLocalPolicy();
    if (stored) return stored;
    return {
      ...getDefaultPolicy(),
      owner_address: identity.address,
      updated_at: Date.now()
    };
  });
  
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>(getLocalRoutingRules());
  const [showRouting, setShowRouting] = useState(false);

  const updatePolicy = async (updates: Partial<CallPolicy>) => {
    const newPolicy = { ...policy, ...updates, updated_at: Date.now() };
    setPolicy(newPolicy);
    saveLocalPolicy(newPolicy);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      const nonce = cryptoLib.generateNonce();
      const timestamp = Date.now();
      const payload = { policy: newPolicy, nonce, timestamp };
      const signature = cryptoLib.signPayload(identity.secretKey, payload);
      
      ws.send(JSON.stringify({
        type: 'policy:update',
        policy: newPolicy,
        signature,
        from_pubkey: identity.publicKeyBase58,
        nonce,
        timestamp
      }));
    }
    
    toast.success('Settings saved');
  };

  const updateRoutingRule = (ruleId: string, updates: Partial<RoutingRule>) => {
    const newRules = routingRules.map(r => 
      r.id === ruleId ? { ...r, ...updates } : r
    );
    setRoutingRules(newRules);
    saveLocalRoutingRules(newRules);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      const nonce = cryptoLib.generateNonce();
      const timestamp = Date.now();
      const payload = { rules: newRules, from_address: identity.address, nonce, timestamp };
      const signature = cryptoLib.signPayload(identity.secretKey, payload);
      
      ws.send(JSON.stringify({
        type: 'routing:update',
        rules: newRules,
        signature,
        from_pubkey: identity.publicKeyBase58,
        from_address: identity.address,
        nonce,
        timestamp
      }));
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-emerald-400 mb-4"
        data-testid="button-back-permissions"
      >
        <ChevronRight className="w-5 h-5 rotate-180" />
        <span>Back to Settings</span>
      </button>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Who Can Reach You
          </CardTitle>
          <CardDescription className="text-slate-400">
            People can only call you with your permission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-300">Accept calls from</Label>
            <Select
              value={policy.allow_calls_from}
              onValueChange={(v) => updatePolicy({ allow_calls_from: v as AllowCallsFrom })}
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white" data-testid="select-allow-calls">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="contacts" className="text-white">Contacts only</SelectItem>
                <SelectItem value="anyone" className="text-white">Anyone with my ID</SelectItem>
                <SelectItem value="invite_only" className="text-white">Invite passes only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-slate-500 text-xs">
              {policy.allow_calls_from === 'contacts' && 'Only people in your contacts can ring you directly'}
              {policy.allow_calls_from === 'anyone' && 'Anyone with your ID can call you'}
              {policy.allow_calls_from === 'invite_only' && 'Only people with an invite pass can call'}
            </p>
          </div>

          {policy.allow_calls_from === 'contacts' && (
            <div className="space-y-2">
              <Label className="text-slate-300">When unknown callers try to reach you</Label>
              <Select
                value={policy.unknown_caller_behavior}
                onValueChange={(v) => updatePolicy({ unknown_caller_behavior: v as UnknownCallerBehavior })}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white" data-testid="select-unknown-behavior">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="request" className="text-white">Send call request (recommended)</SelectItem>
                  <SelectItem value="ring_unknown" className="text-white">Let them ring (show "Unknown")</SelectItem>
                  <SelectItem value="block" className="text-white">Block silently</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-slate-500 text-xs">
                {policy.unknown_caller_behavior === 'request' && 'They\'ll send a request you can accept or decline'}
                {policy.unknown_caller_behavior === 'ring_unknown' && 'Your phone will ring but show them as unknown'}
                {policy.unknown_caller_behavior === 'block' && 'They won\'t be able to reach you at all'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Spam Protection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Max calls per person</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={20}
                value={policy.max_rings_per_sender}
                onChange={(e) => updatePolicy({ max_rings_per_sender: parseInt(e.target.value) || 5 })}
                className="w-20 bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-max-rings"
              />
              <span className="text-slate-400">per</span>
              <Input
                type="number"
                min={1}
                max={60}
                value={policy.ring_window_minutes}
                onChange={(e) => updatePolicy({ ring_window_minutes: parseInt(e.target.value) || 10 })}
                className="w-20 bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-ring-window"
              />
              <span className="text-slate-400">minutes</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Auto-block after rejections</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={10}
                value={policy.auto_block_after_rejections}
                onChange={(e) => updatePolicy({ auto_block_after_rejections: parseInt(e.target.value) || 5 })}
                className="w-20 bg-slate-900/50 border-slate-600 text-white"
                data-testid="input-auto-block"
              />
              <span className="text-slate-400">declined calls</span>
            </div>
            <p className="text-slate-500 text-xs">
              Automatically block callers after this many rejected attempts
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <button
            onClick={() => setShowRouting(!showRouting)}
            className="w-full flex items-center justify-between"
          >
            <CardTitle className="text-white flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Smart Replies
            </CardTitle>
            <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${showRouting ? 'rotate-90' : ''}`} />
          </button>
          <CardDescription className="text-slate-400">
            Automatically respond in certain situations
          </CardDescription>
        </CardHeader>
        {showRouting && (
          <CardContent className="space-y-4">
            {routingRules.map((rule) => (
              <div key={rule.id} className="space-y-2 p-3 bg-slate-900/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">
                      {rule.trigger === 'unknown_caller' && 'Unknown Caller'}
                      {rule.trigger === 'missed_call' && 'Missed Call'}
                      {rule.trigger === 'after_hours' && 'After Hours'}
                      {rule.trigger === 'busy' && 'While Busy'}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {rule.trigger === 'unknown_caller' && 'When someone not in contacts calls'}
                      {rule.trigger === 'missed_call' && 'When you miss a call'}
                      {rule.trigger === 'after_hours' && 'Outside business hours'}
                      {rule.trigger === 'busy' && 'When you\'re on another call'}
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => updateRoutingRule(rule.id, { enabled: checked })}
                    data-testid={`switch-routing-${rule.id}`}
                  />
                </div>
                {rule.enabled && (
                  <Input
                    value={rule.auto_message || ''}
                    onChange={(e) => updateRoutingRule(rule.id, { auto_message: e.target.value })}
                    className="bg-slate-900/50 border-slate-600 text-white text-sm"
                    placeholder="Auto-reply message..."
                    data-testid={`input-routing-${rule.id}`}
                  />
                )}
                {rule.trigger === 'after_hours' && rule.enabled && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">Hours:</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.business_hours?.start || 9}
                      onChange={(e) => updateRoutingRule(rule.id, { 
                        business_hours: { 
                          start: parseInt(e.target.value) || 9, 
                          end: rule.business_hours?.end || 17 
                        } 
                      })}
                      className="w-16 bg-slate-900/50 border-slate-600 text-white"
                    />
                    <span className="text-slate-400">to</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.business_hours?.end || 17}
                      onChange={(e) => updateRoutingRule(rule.id, { 
                        business_hours: { 
                          start: rule.business_hours?.start || 9, 
                          end: parseInt(e.target.value) || 17 
                        } 
                      })}
                      className="w-16 bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
