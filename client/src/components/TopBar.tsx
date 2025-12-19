import { User } from 'lucide-react';
import { getUserProfile } from '@/lib/storage';

interface TopBarProps {
  title?: string;
}

export function TopBar({ title = 'Call Vault' }: TopBarProps) {
  const profile = getUserProfile();

  return (
    <header className="sticky top-0 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 z-30 safe-area-inset-top">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-white">{title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 hidden sm:block">
            {profile.displayName === 'Anonymous' ? 'Private Mode' : profile.displayName}
          </span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
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
