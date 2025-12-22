import { Smile } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/featureFlags';
import type { MessageReaction } from '@shared/types';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiReactionPicker({ onSelect, onClose }: EmojiReactionPickerProps) {
  if (!isFeatureEnabled('EMOJI_REACTIONS')) {
    return null;
  }

  return (
    <div 
      className="absolute bottom-full mb-2 left-0 flex items-center gap-1 px-2 py-1.5 bg-slate-800 rounded-full shadow-lg border border-slate-700 z-50"
      data-testid="emoji-reaction-picker"
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded-full transition-colors text-lg"
          data-testid={`emoji-btn-${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface MessageReactionsProps {
  reactions: MessageReaction[];
  myAddress: string;
  onReact: (emoji: string) => void;
  isMe: boolean;
}

export function MessageReactions({ reactions, myAddress, onReact, isMe }: MessageReactionsProps) {
  if (!isFeatureEnabled('EMOJI_REACTIONS') || !reactions || reactions.length === 0) {
    return null;
  }

  const grouped = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.from_address);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`} data-testid="message-reactions">
      {Object.entries(grouped).map(([emoji, addresses]) => {
        const isMine = addresses.includes(myAddress);
        return (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
              isMine 
                ? 'bg-emerald-500/20 border border-emerald-500/30' 
                : 'bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700'
            }`}
            data-testid={`reaction-${emoji}`}
          >
            <span>{emoji}</span>
            {addresses.length > 1 && (
              <span className="text-slate-400">{addresses.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ReactionTriggerProps {
  onOpenPicker: () => void;
  isMe: boolean;
}

export function ReactionTrigger({ onOpenPicker, isMe }: ReactionTriggerProps) {
  if (!isFeatureEnabled('EMOJI_REACTIONS')) {
    return null;
  }

  return (
    <button
      onClick={onOpenPicker}
      className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700 rounded ${
        isMe ? 'order-first mr-1' : 'order-last ml-1'
      }`}
      data-testid="reaction-trigger"
    >
      <Smile className="w-4 h-4 text-slate-400" />
    </button>
  );
}
