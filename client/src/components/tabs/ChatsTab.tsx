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

  useEffect(() => {
    setContacts(getContacts());
  }, []);

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
          {sortedConversations.map(convo => (
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
                <Avatar 
                  name={getContactName(convo.participant_addresses)} 
                  address={getOtherAddress(convo.participant_addresses)} 
                  size="md" 
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white truncate">
                    {convo.type === 'group' ? convo.name : getContactName(convo.participant_addresses)}
                  </span>
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
          ))}
        </div>
      )}
    </div>
  );
}
