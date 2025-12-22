import { useState } from 'react';
import { Copy, Reply, Forward, Trash2, Smile, Share2, Pin, Flag } from 'lucide-react';
import { toast } from 'sonner';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🙏'];

interface MessageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  isOwnMessage: boolean;
  messageContent: string;
  messageType: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
}

export function MessageContextMenu({
  isOpen,
  position,
  isOwnMessage,
  messageContent,
  messageType,
  onClose,
  onReact,
  onCopy,
  onReply,
  onForward,
  onDelete
}: MessageContextMenuProps) {
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  
  if (!isOpen) return null;

  const handleCopy = () => {
    if (messageType === 'text' && messageContent) {
      navigator.clipboard.writeText(messageContent);
      toast.success('Copied to clipboard');
    }
    onCopy();
    onClose();
  };

  const handleReact = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        data-testid="context-menu-backdrop"
      />
      
      <div 
        className="fixed z-50 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden min-w-[200px] animate-in fade-in zoom-in-95 duration-150"
        style={{
          left: Math.min(position.x, window.innerWidth - 220),
          top: Math.min(position.y, window.innerHeight - 350)
        }}
        data-testid="message-context-menu"
      >
        <div className="flex items-center gap-1 p-2 border-b border-slate-700 bg-slate-800/80">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className="w-9 h-9 flex items-center justify-center hover:bg-slate-700 rounded-full transition-all hover:scale-110 text-xl"
              data-testid={`context-emoji-${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        
        <div className="py-1">
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-white hover:bg-slate-700 text-left transition-colors"
            data-testid="context-reply"
          >
            <Reply className="w-5 h-5 text-slate-400" />
            <span>Reply</span>
          </button>
          
          {messageType === 'text' && messageContent && (
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-white hover:bg-slate-700 text-left transition-colors"
              data-testid="context-copy"
            >
              <Copy className="w-5 h-5 text-slate-400" />
              <span>Copy</span>
            </button>
          )}
          
          <button
            onClick={() => {
              onForward();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-white hover:bg-slate-700 text-left transition-colors"
            data-testid="context-forward"
          >
            <Forward className="w-5 h-5 text-slate-400" />
            <span>Forward</span>
          </button>
          
          <button
            onClick={() => {
              toast.info('Pin feature coming soon');
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-white hover:bg-slate-700 text-left transition-colors"
            data-testid="context-pin"
          >
            <Pin className="w-5 h-5 text-slate-400" />
            <span>Pin</span>
          </button>
          
          {isOwnMessage && (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:bg-red-500/10 text-left transition-colors"
              data-testid="context-delete"
            >
              <Trash2 className="w-5 h-5" />
              <span>Delete</span>
            </button>
          )}
          
          {!isOwnMessage && (
            <button
              onClick={() => {
                toast.info('Message reported');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:bg-slate-700 text-left transition-colors"
              data-testid="context-report"
            >
              <Flag className="w-5 h-5" />
              <span>Report</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
