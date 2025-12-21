import { User, Crown, Shield } from 'lucide-react';
import { getUserProfile } from '@/lib/storage';

interface TopBarProps {
  title?: string;
  isFounder?: boolean;
  isAdmin?: boolean;
}

export function TopBar({ title = 'Call Vault', isFounder = false, isAdmin = false }: TopBarProps) {
  const profile = getUserProfile();

  return (
    <header className="sticky top-0 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 z-30 safe-area-inset-top">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-white">{title}</h1>
          {isFounder && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-full">
              <Crown className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Founder</span>
            </div>
          )}
          {!isFounder && isAdmin && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 rounded-full">
              <Shield className="w-3 h-3 text-purple-400" />
              <span className="text-xs font-medium text-purple-400">Admin</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 hidden sm:block">
            {profile.displayName === 'Anonymous' ? 'Private Mode' : profile.displayName}
          </span>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isFounder ? 'bg-gradient-to-br from-amber-500 to-yellow-600 ring-2 ring-amber-400/50' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
