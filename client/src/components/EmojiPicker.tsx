import { useState } from 'react';
import { X } from 'lucide-react';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '🙄', '😬', '🤫', '🤔', '🤭', '😌', '😴', '🤤'],
  'Gestures': ['👋', '🤚', '✋', '🖐️', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🤲', '🙏', '💪', '🦾', '🖕', '🤝'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '😍', '🥰', '😘', '😻', '💑', '💏', '👩‍❤️‍👨'],
  'Animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝'],
  'Food': ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🍿', '🍩', '🍪', '🎂', '🍰'],
  'Activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🎿', '⛷️'],
  'Objects': ['📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '💿', '📀', '📷', '📸', '🎥', '📹', '🎬', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏰', '⌚', '📡', '🔋', '💡', '🔦', '🕯️', '🔧', '🔨', '⚒️', '🛠️'],
  'Symbols': ['💯', '🔥', '⭐', '🌟', '✨', '💫', '💥', '💢', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗯️', '💭', '💤', '🎵', '🎶', '🔔', '📣', '📢', '⚡', '🔆', '🔅', '⚠️', '❌', '⭕', '✅', '✔️']
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState('Smileys');
  const [searchQuery, setSearchQuery] = useState('');
  
  const categories = Object.keys(EMOJI_CATEGORIES);
  const currentEmojis = EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES] || [];
  
  const allEmojis = searchQuery 
    ? Object.values(EMOJI_CATEGORIES).flat()
    : currentEmojis;

  return (
    <div 
      className="absolute bottom-14 left-0 w-[300px] bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50"
      data-testid="emoji-picker"
    >
      <div className="flex items-center justify-between p-2 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-300">Emoji</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded"
          data-testid="close-emoji-picker"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      
      <div className="flex gap-1 p-2 border-b border-slate-700 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-1 text-xs rounded whitespace-nowrap ${
              activeCategory === cat 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'text-slate-400 hover:bg-slate-700'
            }`}
            data-testid={`emoji-category-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-8 gap-1 p-2 max-h-[200px] overflow-y-auto">
        {allEmojis.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            onClick={() => {
              onSelect(emoji);
            }}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-xl transition-colors"
            data-testid={`emoji-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
