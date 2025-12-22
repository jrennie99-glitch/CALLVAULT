import { useState, useCallback, useRef } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Message } from '@shared/types';

interface MessageSearchProps {
  convoId: string;
  messages: Message[];
  onJumpToMessage: (messageId: string) => void;
  onClose: () => void;
}

export function MessageSearch({ convoId, messages, onJumpToMessage, onClose }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setCurrentIndex(0);
      return;
    }

    setIsSearching(true);
    const lowerQuery = searchQuery.toLowerCase();
    
    const matches = messages.filter(m => 
      m.content && m.content.toLowerCase().includes(lowerQuery)
    ).sort((a, b) => b.timestamp - a.timestamp);
    
    setResults(matches);
    setCurrentIndex(0);
    setIsSearching(false);
    
    if (matches.length > 0) {
      onJumpToMessage(matches[0].id);
    }
  }, [messages, onJumpToMessage]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const goToNext = () => {
    if (results.length === 0) return;
    const newIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(newIndex);
    onJumpToMessage(results[newIndex].id);
  };

  const goToPrevious = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex === 0 ? results.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    onJumpToMessage(results[newIndex].id);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-800 border-b border-slate-700">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search messages..."
          className="pl-9 bg-slate-900 border-slate-600 text-white"
          autoFocus
          data-testid="input-message-search"
        />
      </div>
      
      {results.length > 0 && (
        <span className="text-sm text-slate-400 whitespace-nowrap" data-testid="text-search-results">
          {currentIndex + 1} of {results.length}
        </span>
      )}
      
      {query && results.length === 0 && !isSearching && (
        <span className="text-sm text-slate-500 whitespace-nowrap">No results</span>
      )}
      
      <Button
        variant="ghost"
        size="icon"
        onClick={goToPrevious}
        disabled={results.length === 0}
        className="text-slate-400 hover:text-white"
        data-testid="button-search-prev"
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={goToNext}
        disabled={results.length === 0}
        className="text-slate-400 hover:text-white"
        data-testid="button-search-next"
      >
        <ArrowDown className="w-4 h-4" />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="text-slate-400 hover:text-white"
        data-testid="button-search-close"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
