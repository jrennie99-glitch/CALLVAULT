import { Phone, Users, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType = 'calls' | 'contacts' | 'add' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: typeof Phone }[] = [
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-area-inset-bottom z-40">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full transition-colors',
                isActive ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className={cn('w-6 h-6 mb-1', isActive && 'scale-110')} />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
