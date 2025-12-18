import { Phone, Users, Plus, Settings, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType = 'chats' | 'calls' | 'contacts' | 'add' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  unreadCount?: number;
}

const tabs: { id: TabType; label: string; icon: typeof Phone }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({ activeTab, onTabChange, unreadCount = 0 }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-area-inset-bottom z-40">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === 'chats' && unreadCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full transition-colors relative',
                isActive ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              )}
              data-testid={`tab-${tab.id}`}
            >
              <div className="relative">
                <Icon className={cn('w-6 h-6 mb-1', isActive && 'scale-110')} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
