import { useState } from 'react';
import { X, Search } from 'lucide-react';

const MEME_LIBRARY = [
  { id: 'drake', name: 'Drake Approves', url: 'https://i.imgflip.com/30b1gx.jpg' },
  { id: 'distracted', name: 'Distracted Boyfriend', url: 'https://i.imgflip.com/1ur9b0.jpg' },
  { id: 'change_mind', name: 'Change My Mind', url: 'https://i.imgflip.com/24y43o.jpg' },
  { id: 'buttons', name: 'Two Buttons', url: 'https://i.imgflip.com/1g8my4.jpg' },
  { id: 'monkey', name: 'Monkey Puppet', url: 'https://i.imgflip.com/2gnnjh.jpg' },
  { id: 'doge', name: 'Doge', url: 'https://i.imgflip.com/4t0m5.jpg' },
  { id: 'fry', name: 'Futurama Fry', url: 'https://i.imgflip.com/21uy0f.jpg' },
  { id: 'disaster_girl', name: 'Disaster Girl', url: 'https://i.imgflip.com/23ls.jpg' },
  { id: 'success_kid', name: 'Success Kid', url: 'https://i.imgflip.com/1bhk.jpg' },
  { id: 'spongebob', name: 'Mocking Spongebob', url: 'https://i.imgflip.com/1otk96.jpg' },
  { id: 'this_is_fine', name: 'This Is Fine', url: 'https://i.imgflip.com/wxica.jpg' },
  { id: 'expanding_brain', name: 'Expanding Brain', url: 'https://i.imgflip.com/1jwhww.jpg' },
  { id: 'one_does_not', name: 'One Does Not Simply', url: 'https://i.imgflip.com/1bij.jpg' },
  { id: 'always_has_been', name: 'Always Has Been', url: 'https://i.imgflip.com/46e43q.png' },
  { id: 'think_about_it', name: 'Roll Safe Think', url: 'https://i.imgflip.com/1h7in3.jpg' },
  { id: 'stonks', name: 'Stonks', url: 'https://i.imgflip.com/3e0e3e.png' },
  { id: 'woman_yelling', name: 'Woman Yelling at Cat', url: 'https://i.imgflip.com/345v97.jpg' },
  { id: 'bernie', name: 'Bernie Sanders', url: 'https://i.imgflip.com/4t0me8.jpg' },
  { id: 'gru_plan', name: 'Gru Plan', url: 'https://i.imgflip.com/26jxvz.jpg' },
  { id: 'sad_pablo', name: 'Sad Pablo Escobar', url: 'https://i.imgflip.com/1c1uej.jpg' },
  { id: 'left_exit', name: 'Left Exit 12', url: 'https://i.imgflip.com/22bdq6.jpg' },
  { id: 'batman_slap', name: 'Batman Slapping Robin', url: 'https://i.imgflip.com/9ehk.jpg' },
  { id: 'hide_pain', name: 'Hide the Pain Harold', url: 'https://i.imgflip.com/gk5el.jpg' },
  { id: 'surprised_pikachu', name: 'Surprised Pikachu', url: 'https://i.imgflip.com/2kbn1e.jpg' }
];

interface MemePickerProps {
  onSelect: (url: string, name: string) => void;
  onClose: () => void;
}

export function MemePicker({ onSelect, onClose }: MemePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredMemes = searchQuery.trim()
    ? MEME_LIBRARY.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : MEME_LIBRARY;

  return (
    <div 
      className="absolute bottom-14 left-0 w-[320px] bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50"
      data-testid="meme-picker"
    >
      <div className="flex items-center justify-between p-2 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-300">Memes</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded"
          data-testid="close-meme-picker"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      
      <div className="p-2 border-b border-slate-700">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memes..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            data-testid="meme-search"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-1 p-2 max-h-[250px] overflow-y-auto">
        {filteredMemes.map((meme) => (
          <button
            key={meme.id}
            onClick={() => {
              onSelect(meme.url, meme.name);
              onClose();
            }}
            className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all group"
            data-testid={`meme-${meme.id}`}
          >
            <img 
              src={meme.url} 
              alt={meme.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
              <span className="text-[10px] text-white truncate">{meme.name}</span>
            </div>
          </button>
        ))}
      </div>
      
      {filteredMemes.length === 0 && (
        <div className="p-4 text-center text-slate-500 text-sm">
          No memes found
        </div>
      )}
    </div>
  );
}
