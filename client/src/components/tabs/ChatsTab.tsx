import { useState, useEffect } from 'react';
import { MessageSquare, Users, Plus, Search } from 'lucide-react';
import { getLocalConversations, getLocalMessages } from '@/lib/messageStorage';
import { getContacts, type Contact } from '@/lib/storage';
import { Avatar } from '@/components/Avatar';
import type { Conversation, Message } from '@shared/types';
import { formatDistanceToNow } from 'date-fns';

interface ChatsTabProps {
  myAddress: string;
  onSelectChat: (convo: Conversation) => void;
  onCreateGroup: () => void;
  conversations: Conversation[];
}

export function ChatsTab({ myAddress, onSelectChat, onCreateGroup, conversations }: ChatsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setContacts(getContacts());
  }, []);

  // Fetch online status for all conversation participants
  useEffect(() => {
    const fetchOnlineStatus = async () => {
      const addresses = new Set<string>();
      conversations.forEach(convo => {
        if (convo.type !== 'group') {
          const otherAddr = convo.participant_addresses.find(a => a !== myAddress);
          if (otherAddr) addresses.add(otherAddr);
        }
      });

      if (addresses.size === 0) return;

      try {
        const response = await fetch('/api/online-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: Array.from(addresses) })
        });
        if (response.ok) {
          const status = await response.json();
          setOnlineStatus(status);
        }
      } catch (error) {
        console.error('Failed to fetch online status:', error);
      }
    };

    fetchOnlineStatus();
    // Refresh online status every 30 seconds
    const interval = setInterval(fetchOnlineStatus, 30000);
    return () => clearInterval(interval);
  }, [conversations, myAddress]);

  const getContactName = (addresses: string[]): string => {
    const otherAddress = addresses.find(a => a !== myAddress);
    if (!otherAddress) return 'Unknown';
    const contact = contacts.find(c => c.address === otherAddress);
    return contact?.name || otherAddress.slice(0, 15) + '...';
  };

  const getOtherAddress = (addresses: string[]): string => {
    return addresses.find(a => a !== myAddress) || '';
  };

  const filteredConversations = conversations.filter(convo => {
    if (!searchQuery) return true;
    const name = convo.type === 'group' ? convo.name : getContactName(convo.participant_addresses);
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sortedConversations = [...filteredConversations].sort((a, b) => {
    const aTime = a.last_message?.timestamp || a.created_at;
    const bTime = b.last_message?.timestamp || b.created_at;
    return bTime - aTime;
  });

  const formatMessagePreview = (msg?: Message): string => {
    if (!msg) return 'No messages yet';
    switch (msg.type) {
      case 'image': return '📷 Photo';
      case 'video': return '🎬 Video';
      case 'video_message': return '📹 Video message';
      case 'file': return `📎 ${msg.attachment_name || 'File'}`;
      case 'voice': return '🎤 Voice message';
      default: return msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '');
    }
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return '';
    return formatDistanceToNow(timestamp, { addSuffix: false });
  };

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Chats</h1>
          <button
            onClick={onCreateGroup}
            className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            data-testid="button-create-group"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            data-testid="input-search-chats"
          />
        </div>
      </div>

      {sortedConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
            <MessageSquare className="w-10 h-10 text-slate-600" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Chats Yet</h2>
          <p className="text-slate-400 mb-6">Start a conversation with your contacts or create a group chat</p>
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors"
            data-testid="button-create-first-group"
          >
            <Users className="w-5 h-5" />
            Create Group
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {sortedConversations.map(convo => {
            const otherAddress = getOtherAddress(convo.participant_addresses);
            const isOnline = convo.type !== 'group' && onlineStatus[otherAddress];
            
            return (
              <button
                key={convo.id}
                onClick={() => onSelectChat(convo)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors text-left"
                data-testid={`chat-${convo.id}`}
              >
                {convo.type === 'group' ? (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                ) : (
                  <div className="relative">
                    <Avatar 
                      name={getContactName(convo.participant_addresses)} 
                      address={otherAddress} 
                      size="md" 
                    />
                    {isOnline && (
                      <div 
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900"
                        data-testid={`online-indicator-${otherAddress}`}
                      />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-white truncate">
                        {convo.type === 'group' ? convo.name : getContactName(convo.participant_addresses)}
                      </span>
                      {isOnline && (
                        <span className="text-xs text-emerald-400 flex-shrink-0">Online</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {formatTime(convo.last_message?.timestamp || convo.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-sm text-slate-400 truncate">
                      {formatMessagePreview(convo.last_message)}
                    </span>
                    {(convo.unread_count || 0) > 0 && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                        {convo.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
