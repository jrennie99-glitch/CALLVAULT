import { useState } from 'react';
import { Plus, UserPlus, QrCode, X } from 'lucide-react';
import type { TabType } from './BottomNav';

interface FABProps {
  onNavigate: (tab: TabType) => void;
  onAction?: (action: 'add-contact' | 'share-qr') => void;
}

export function FAB({ onNavigate, onAction }: FABProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { icon: UserPlus, label: 'Add Contact', action: () => onNavigate('add') },
    { icon: QrCode, label: 'Share My QR', action: () => onAction?.('share-qr') },
  ];

  return (
    <div className="fixed bottom-24 right-4 z-40">
      <div className={`flex flex-col-reverse gap-3 mb-3 transition-all duration-200 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {actions.map((item, index) => (
          <button
            key={index}
            onClick={() => {
              item.action();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 justify-end animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
              {item.label}
            </span>
            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center shadow-lg">
              <item.icon className="w-5 h-5 text-white" />
            </div>
          </button>
        ))}
      </div>
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
        data-testid="button-fab"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
}
