import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, Send, Paperclip, Mic, Image, File, X, Play, Pause, Check, CheckCheck, Users, MoreVertical, Phone, Video, VideoIcon, Camera, Crown, Smile, ImageIcon, Search, RotateCcw, AlertCircle } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { EncryptionIndicator } from '@/components/EncryptionIndicator';
import { EmojiReactionPicker, MessageReactions, ReactionTrigger } from '@/components/EmojiReactions';
import { EmojiPicker } from '@/components/EmojiPicker';
import { MemePicker } from '@/components/MemePicker';
import { MessageContextMenu } from '@/components/MessageContextMenu';
import { MessageSearch } from '@/components/MessageSearch';
import { getContacts, type Contact } from '@/lib/storage';
import { getLocalMessages, saveLocalMessage, updateLocalMessageStatus, getLocalConversation, clearUnreadCount, getPrivacySettings, generateMessageId } from '@/lib/messageStorage';
import { signMessage } from '@/lib/crypto';
import { isFeatureEnabled } from '@/lib/featureFlags';
import type { Message, Conversation, CryptoIdentity, WSMessage, MessageType, MessageStatus, MessageReaction } from '@shared/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ChatPageProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack: () => void;
  convo: Conversation;
  onStartCall: (address: string, video: boolean) => void;
  isFounder?: boolean;
}

export function ChatPage({ identity, ws, onBack, convo, onStartCall, isFounder = false }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMemePicker, setShowMemePicker] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    message: Message | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, message: null });
  const [showSearch, setShowSearch] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const privacySettings = getPrivacySettings();

  useEffect(() => {
    setContacts(getContacts());
    loadMessages();
    clearUnreadCount(convo.id);
  }, [convo.id]);
  
  // Reload messages when page gains focus (for multi-device sync)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadMessages();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [convo.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      const data: WSMessage = JSON.parse(event.data);

      if (data.type === 'msg:incoming' && data.message.convo_id === convo.id) {
        const msg = data.message;
        saveLocalMessage(msg);
        setMessages(prev => [...prev, msg]);
        
        if (privacySettings.readReceipts) {
          ws.send(JSON.stringify({
            type: 'msg:read',
            message_ids: [msg.id],
            convo_id: convo.id,
            reader_address: identity.address
          }));
        }
      }

      if (data.type === 'msg:delivered' && data.convo_id === convo.id) {
        updateLocalMessageStatus(data.message_id, 'delivered');
        setMessages(prev => prev.map(m => 
          m.id === data.message_id ? { ...m, status: 'delivered' } : m
        ));
      }

      if (data.type === 'msg:read' && data.convo_id === convo.id) {
        for (const msgId of data.message_ids) {
          updateLocalMessageStatus(msgId, 'read');
        }
        setMessages(prev => prev.map(m => 
          data.message_ids.includes(m.id) ? { ...m, status: 'read' } : m
        ));
      }

      if (data.type === 'msg:typing' && data.convo_id === convo.id) {
        if (privacySettings.typingIndicators) {
          setRemoteTyping(data.is_typing);
        }
      }

      if (data.type === 'msg:reaction' && data.convo_id === convo.id) {
        const { message_id, emoji, from_address } = data;
        setMessages(prev => prev.map(m => {
          if (m.id !== message_id) return m;
          const existing = m.reactions?.find(r => r.from_address === from_address && r.emoji === emoji);
          if (existing) {
            return { ...m, reactions: m.reactions?.filter(r => !(r.from_address === from_address && r.emoji === emoji)) };
          }
          return { ...m, reactions: [...(m.reactions || []), { emoji, from_address, timestamp: Date.now() }] };
        }));
      }

      // Handle message acknowledgment from server
      if (data.type === 'msg:ack') {
        const { message_id, status } = data;
        // 'received' = server got the message, 'duplicate' = message already exists
        if (status === 'received' || status === 'duplicate') {
          updateLocalMessageStatus(message_id, 'sent');
          setMessages(prev => prev.map(m => 
            m.id === message_id ? { ...m, status: 'sent' } : m
          ));
        }
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, convo.id, identity.address, privacySettings]);

  const loadMessages = async () => {
    // First load local messages for instant display
    const localMsgs = getLocalMessages(convo.id);
    setMessages(localMsgs);
    
    // Then fetch from server to get any messages we might have missed
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(convo.id)}?limit=100`);
      if (response.ok) {
        const serverMsgs: Message[] = await response.json();
        if (serverMsgs && serverMsgs.length > 0) {
          // Create a map of local messages for quick lookup
          const localMsgMap = new Map(localMsgs.map(m => [m.id, m]));
          const mergedMsgs: Message[] = [];
          
          // Process all server messages, updating local versions if needed
          for (const serverMsg of serverMsgs) {
            const localMsg = localMsgMap.get(serverMsg.id);
            if (localMsg) {
              // Update existing message with server data (e.g., status updates)
              const merged = {
                ...localMsg,
                ...serverMsg,
                // Keep the more advanced status
                status: getMoreAdvancedStatus(localMsg.status, serverMsg.status)
              };
              saveLocalMessage(merged);
              mergedMsgs.push(merged);
              localMsgMap.delete(serverMsg.id); // Mark as processed
            } else {
              // New message from server
              saveLocalMessage(serverMsg);
              mergedMsgs.push(serverMsg);
            }
          }
          
          // Add any local-only messages that aren't on server
          localMsgMap.forEach((localMsg) => {
            mergedMsgs.push(localMsg);
          });
          
          // Sort by timestamp
          mergedMsgs.sort((a, b) => a.timestamp - b.timestamp);
          setMessages(mergedMsgs);
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages from server:', error);
    }
  };
  
  // Helper to determine which message status is more advanced
  const getMoreAdvancedStatus = (status1?: MessageStatus, status2?: MessageStatus): MessageStatus => {
    const statusOrder: MessageStatus[] = ['sending', 'sent', 'delivered', 'read'];
    const idx1 = statusOrder.indexOf(status1 || 'sending');
    const idx2 = statusOrder.indexOf(status2 || 'sending');
    return statusOrder[Math.max(idx1, idx2)] || 'sent';
  };

  const getContactName = (address: string): string => {
    if (address === identity.address) return 'You';
    const contact = contacts.find(c => c.address === address);
    return contact?.name || address.slice(0, 12) + '...';
  };

  const getOtherAddress = (): string => {
    return convo.participant_addresses.find(a => a !== identity.address) || '';
  };

  const sendMessage = async (type: MessageType, content: string, attachmentUrl?: string, attachmentName?: string, attachmentSize?: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }

    const message: Message = {
      id: generateMessageId(),
      convo_id: convo.id,
      from_address: identity.address,
      to_address: getOtherAddress(),
      timestamp: Date.now(),
      type,
      content,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      attachment_size: attachmentSize,
      nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
      status: 'sending'
    };

    saveLocalMessage(message);
    setMessages(prev => [...prev, message]);

    try {
      const signedMessage = await signMessage(identity, message);
      ws.send(JSON.stringify({
        type: 'msg:send',
        data: signedMessage
      }));
      // Status remains 'sending' until we receive msg:ack from server
      // The WebSocket message handler will update status to 'sent' on ack
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark as failed so user can retry
      const failedMessage = { ...message, status: 'failed' as const };
      saveLocalMessage(failedMessage);
      setMessages(prev => prev.map(m => m.id === message.id ? failedMessage : m));
    }
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;
    sendMessage('text', inputText.trim());
    setInputText('');
    sendTypingIndicator(false);
  };

  const sendTypingIndicator = (typing: boolean) => {
    if (!ws || !privacySettings.typingIndicators) return;
    if (isTyping === typing) return;
    setIsTyping(typing);
    ws.send(JSON.stringify({
      type: 'msg:typing',
      convo_id: convo.id,
      from_address: identity.address,
      is_typing: typing
    }));
  };

  const handleReaction = (messageId: string, emoji: string) => {
    if (!ws || !isFeatureEnabled('EMOJI_REACTIONS')) return;
    
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    
    const existingReaction = msg.reactions?.find(r => r.from_address === identity.address && r.emoji === emoji);
    
    if (existingReaction) {
      const updatedReactions = msg.reactions?.filter(r => !(r.from_address === identity.address && r.emoji === emoji)) || [];
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, reactions: updatedReactions } : m
      ));
    } else {
      const newReaction: MessageReaction = {
        emoji,
        from_address: identity.address,
        timestamp: Date.now()
      };
      const updatedReactions = [...(msg.reactions || []), newReaction];
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, reactions: updatedReactions } : m
      ));
    }
    
    ws.send(JSON.stringify({
      type: 'msg:reaction',
      message_id: messageId,
      convo_id: convo.id,
      emoji,
      from_address: identity.address
    }));
    
    setActiveReactionMsgId(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    sendTypingIndicator(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingIndicator(false);
    }, 3000);
  };

  const [activeUploads, setActiveUploads] = useState<Map<string, { name: string; progress: number }>>(new Map());
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - server enforced

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileUpload = async (file: File, type: 'image' | 'file' | 'video') => {
    // Client-side size check for quick feedback (server enforces actual limit)
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Max size: ${formatFileSize(MAX_FILE_SIZE)}`);
      return;
    }

    const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      setActiveUploads(prev => new Map(prev).set(uploadId, { name: file.name, progress: 0 }));
      
      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise<{url: string, name: string, size: number}>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setActiveUploads(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(uploadId);
              if (existing) {
                newMap.set(uploadId, { ...existing, progress });
              }
              return newMap;
            });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
        xhr.send(file);
      });

      const { url, name, size } = await uploadPromise;
      sendMessage(type, '', url, name, size);
      setShowAttachMenu(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
      console.error(error);
    } finally {
      setActiveUploads(prev => {
        const newMap = new Map(prev);
        newMap.delete(uploadId);
        return newMap;
      });
    }
  };

  const handleSendMeme = (memeUrl: string, memeName: string) => {
    sendMessage('meme', memeName, memeUrl, memeName);
    setShowMemePicker(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({
        isOpen: true,
        position: { x: clientX, y: clientY },
        message: msg
      });
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 400);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleContextMenuReact = (emoji: string) => {
    if (contextMenu.message) {
      handleReaction(contextMenu.message.id, emoji);
    }
  };

  const handleContextMenuCopy = () => {
    // Already handled in context menu
  };

  const handleContextMenuReply = () => {
    if (contextMenu.message) {
      setInputText(`> ${contextMenu.message.content}\n`);
      toast.info('Reply feature coming soon');
    }
  };

  const handleContextMenuForward = () => {
    toast.info('Forward feature coming soon');
  };

  const handleContextMenuDelete = () => {
    if (contextMenu.message) {
      setMessages(prev => prev.filter(m => m.id !== contextMenu.message!.id));
      toast.success('Message deleted');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Store the start time for duration calculation
      const startTime = Date.now();
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        
        // Only proceed if we have recorded data (not cancelled)
        if (audioChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        const fileName = `voice_${Date.now()}.webm`;
        
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: audioBlob,
            headers: {
              'Content-Type': 'audio/webm',
              'X-Filename': fileName
            }
          });
          
          if (!res.ok) throw new Error('Upload failed');
          const { url, name, size } = await res.json();
          
          // Create message with duration
          const message: Message = {
            id: generateMessageId(),
            convo_id: convo.id,
            from_address: identity.address,
            to_address: getOtherAddress(),
            timestamp: Date.now(),
            type: 'voice',
            content: '',
            attachment_url: url,
            attachment_name: name,
            attachment_size: size,
            attachment_duration: durationSeconds,
            nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
            status: 'sending'
          };
          
          saveLocalMessage(message);
          setMessages(prev => [...prev, message]);
          
          const signedMessage = await signMessage(identity, message);
          ws?.send(JSON.stringify({
            type: 'msg:send',
            data: signedMessage
          }));
          
          message.status = 'sent';
          saveLocalMessage(message);
          setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'sent' } : m));
        } catch (error) {
          toast.error('Failed to send voice note');
        }
      };
      
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow microphone access.');
      } else {
        toast.error('Failed to access microphone');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const startVideoRecording = async () => {
    try {
      // Check for camera permission first
      const permissionResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (permissionResult.state === 'denied') {
        toast.error('Camera access is blocked. Please enable it in your browser settings.');
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
      videoStreamRef.current = stream;
      
      // Store the start time for duration calculation
      const startTime = Date.now();
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          videoChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Clean up stream tracks
        stream.getTracks().forEach(t => t.stop());
        setVideoPreviewUrl(null);
        
        // Only proceed if we have recorded data (not cancelled)
        if (videoChunksRef.current.length === 0) return;
        
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        const fileName = `video_message_${Date.now()}.webm`;
        
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: videoBlob,
            headers: {
              'Content-Type': 'video/webm',
              'X-Filename': fileName
            }
          });
          
          if (!res.ok) throw new Error('Upload failed');
          const { url, name, size } = await res.json();
          
          // Create message with duration
          const message: Message = {
            id: generateMessageId(),
            convo_id: convo.id,
            from_address: identity.address,
            to_address: getOtherAddress(),
            timestamp: Date.now(),
            type: 'video_message',
            content: '',
            attachment_url: url,
            attachment_name: name,
            attachment_size: size,
            attachment_duration: durationSeconds,
            nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
            status: 'sending'
          };
          
          saveLocalMessage(message);
          setMessages(prev => [...prev, message]);
          
          const signedMessage = await signMessage(identity, message);
          ws?.send(JSON.stringify({
            type: 'msg:send',
            data: signedMessage
          }));
          
          message.status = 'sent';
          saveLocalMessage(message);
          setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'sent' } : m));
        } catch (error) {
          toast.error('Failed to send video message');
        }
      };
      
      mediaRecorder.start(1000); // Collect data every second
      setIsVideoRecording(true);
      setRecordingTime(0);
      
      // Show video preview
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Camera access denied. Please allow camera access to record video messages.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera found. Please connect a camera to record video messages.');
      } else {
        toast.error('Failed to access camera');
      }
      // Clean up any partial state
      setIsVideoRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isVideoRecording) {
      mediaRecorderRef.current.stop();
      setIsVideoRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }
    }
  };

  const cancelVideoRecording = () => {
    if (mediaRecorderRef.current && isVideoRecording) {
      mediaRecorderRef.current.stop();
      videoChunksRef.current = [];
      setIsVideoRecording(false);
      setVideoPreviewUrl(null);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }
    }
  };

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleJumpToMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  }, []);

  const retryMessage = async (msg: Message) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected');
      return;
    }
    
    // Create updated message without mutating original
    const updatedMsg: Message = {
      ...msg,
      status: 'sending',
      timestamp: Date.now()
    };
    
    saveLocalMessage(updatedMsg);
    setMessages(prev => prev.map(m => m.id === msg.id ? updatedMsg : m));
    
    try {
      const signedMessage = await signMessage(identity, updatedMsg);
      ws.send(JSON.stringify({
        type: 'msg:send',
        data: signedMessage
      }));
      // Note: Status will be updated when we receive msg:ack from server
      // If no ack within timeout, message remains in 'sending' state
      // and user can retry again
    } catch (error) {
      console.error('Retry failed:', error);
      const failedMsg: Message = { ...updatedMsg, status: 'failed' };
      saveLocalMessage(failedMsg);
      setMessages(prev => prev.map(m => m.id === msg.id ? failedMsg : m));
    }
  };

  const renderMessageStatus = (msg: Message) => {
    if (msg.from_address !== identity.address) return null;
    switch (msg.status) {
      case 'sending': return <span className="text-slate-500 text-xs animate-pulse">○</span>;
      case 'sent': return <Check className="w-3 h-3 text-slate-400" />;
      case 'delivered': return <CheckCheck className="w-3 h-3 text-slate-400" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-emerald-400" />;
      case 'failed': return (
        <button 
          onClick={() => retryMessage(msg)} 
          className="flex items-center gap-1 text-red-400 hover:text-red-300"
          data-testid={`button-retry-${msg.id}`}
        >
          <AlertCircle className="w-3 h-3" />
          <RotateCcw className="w-3 h-3" />
        </button>
      );
      default: return null;
    }
  };

  const renderAttachment = (msg: Message) => {
    if (msg.type === 'image' && msg.attachment_url) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox({ url: msg.attachment_url!, type: 'image' });
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="block p-0 border-0 bg-transparent cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        >
          <img 
            src={msg.attachment_url} 
            alt="Shared image" 
            className="max-w-[250px] rounded-lg active:opacity-80"
          />
        </button>
      );
    }
    
    if (msg.type === 'file' && msg.attachment_url) {
      return (
        <a 
          href={msg.attachment_url} 
          download={msg.attachment_name}
          className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3 hover:bg-slate-700 transition-colors"
        >
          <File className="w-8 h-8 text-slate-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{msg.attachment_name}</div>
            <div className="text-xs text-slate-400">
              {msg.attachment_size ? `${(msg.attachment_size / 1024).toFixed(1)} KB` : 'File'}
            </div>
          </div>
        </a>
      );
    }
    
    if (msg.type === 'voice' && msg.attachment_url) {
      return (
        <div className="flex items-center gap-2">
          <audio controls src={msg.attachment_url} className="max-w-[200px] h-10" />
        </div>
      );
    }
    
    if (msg.type === 'video' && msg.attachment_url) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox({ url: msg.attachment_url!, type: 'video' });
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="relative block p-0 border-0 bg-transparent cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        >
          <video 
            src={msg.attachment_url} 
            className="max-w-[280px] rounded-lg"
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-slate-900 border-b-[8px] border-b-transparent ml-1" />
            </div>
          </div>
        </button>
      );
    }
    
    if (msg.type === 'video_message' && msg.attachment_url) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox({ url: msg.attachment_url!, type: 'video' });
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="relative block p-0 border-0 bg-transparent cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        >
          <video 
            src={msg.attachment_url} 
            className="max-w-[200px] rounded-xl"
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-slate-900 border-b-[6px] border-b-transparent ml-1" />
            </div>
          </div>
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
            <Camera className="w-3 h-3" />
            <span>Video message</span>
          </div>
        </button>
      );
    }
    
    if (msg.type === 'meme' && msg.attachment_url) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox({ url: msg.attachment_url!, type: 'image' });
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="relative block p-0 border-0 bg-transparent cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        >
          <img 
            src={msg.attachment_url} 
            alt={msg.content || 'Meme'}
            className="max-w-[250px] rounded-lg active:opacity-80"
          />
          {msg.content && (
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
              {msg.content}
            </div>
          )}
        </button>
      );
    }
    
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <header className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur safe-area-top">
        <button onClick={onBack} className="text-slate-400 hover:text-white" data-testid="button-back">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        {isFounder && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-full">
            <Crown className="w-3 h-3 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Founder</span>
          </div>
        )}
        
        {convo.type === 'group' ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
        ) : (
          <Avatar name={getContactName(getOtherAddress())} address={getOtherAddress()} size="sm" />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white truncate">
            {convo.type === 'group' ? convo.name : getContactName(getOtherAddress())}
          </div>
          {remoteTyping ? (
            <div className="text-xs text-emerald-400">typing...</div>
          ) : (
            <EncryptionIndicator type="message" showLabel={false} className="mt-0.5" />
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
            data-testid="button-search-messages"
          >
            <Search className="w-5 h-5" />
          </button>
          {convo.type === 'direct' && (
            <>
              <button
                onClick={() => onStartCall(getOtherAddress(), false)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
                data-testid="button-voice-call"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                onClick={() => onStartCall(getOtherAddress(), true)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
                data-testid="button-video-call"
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </header>
      
      {showSearch && (
        <MessageSearch
          convoId={convo.id}
          messages={messages}
          onJumpToMessage={handleJumpToMessage}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.03)_0%,_transparent_50%)]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-emerald-500 opacity-60" />
            </div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">Start a conversation</h3>
            <p className="text-sm text-slate-500 max-w-[250px]">
              Send a message to {convo.type === 'group' ? 'the group' : getContactName(getOtherAddress())}. Your messages are end-to-end encrypted.
            </p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isMe = msg.from_address === identity.address;
          const showAvatar = !isMe && (idx === 0 || messages[idx - 1].from_address !== msg.from_address);
          
          return (
            <div
              key={msg.id}
              ref={(el) => { messageRefs.current[msg.id] = el; }}
              className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''} ${
                highlightedMessageId === msg.id ? 'animate-pulse bg-emerald-500/20 rounded-lg -mx-2 px-2 py-1' : ''
              }`}
            >
              {!isMe && showAvatar && convo.type === 'group' && (
                <Avatar name={getContactName(msg.from_address)} address={msg.from_address} size="xs" />
              )}
              {!isMe && !showAvatar && convo.type === 'group' && <div className="w-6" />}
              
              <div className={`relative max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="group flex items-center">
                  <ReactionTrigger onOpenPicker={() => setActiveReactionMsgId(msg.id)} isMe={isMe} />
                  <div
                    className={`rounded-2xl px-4 py-2 select-none cursor-pointer active:scale-[0.98] transition-transform ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-slate-800 text-white rounded-bl-md'
                    }`}
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'pan-y' }}
                    onTouchStart={(e) => {
                      handleLongPressStart(e, msg);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleLongPressEnd();
                    }}
                    onTouchCancel={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        isOpen: true,
                        position: { x: e.clientX, y: e.clientY },
                        message: msg
                      });
                    }}
                    data-testid={`message-bubble-${msg.id}`}
                  >
                    {convo.type === 'group' && !isMe && showAvatar && (
                      <div className="text-xs text-emerald-400 mb-1">{getContactName(msg.from_address)}</div>
                    )}
                    
                    {msg.type === 'text' && <p className="break-words">{msg.content}</p>}
                    {renderAttachment(msg)}
                    
                    <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-[10px] opacity-60">
                        {formatDistanceToNow(msg.timestamp, { addSuffix: false })}
                      </span>
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                </div>
                
                {activeReactionMsgId === msg.id && (
                  <EmojiReactionPicker 
                    onSelect={(emoji) => handleReaction(msg.id, emoji)}
                    onClose={() => setActiveReactionMsgId(null)}
                  />
                )}
                
                {msg.reactions && msg.reactions.length > 0 && (
                  <MessageReactions 
                    reactions={msg.reactions}
                    myAddress={identity.address}
                    onReact={(emoji) => handleReaction(msg.id, emoji)}
                    isMe={isMe}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        
        {activeUploads.size > 0 && (
          <div className="flex justify-end mx-4 mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800/90 backdrop-blur-sm rounded-full border border-slate-700 shadow-lg">
              <div className="relative w-5 h-5">
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="2"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${(Array.from(activeUploads.values()).reduce((sum, u) => sum + u.progress, 0) / activeUploads.size / 100) * 50.26} 50.26`}
                  />
                </svg>
              </div>
              <span className="text-sm text-white font-medium">
                {activeUploads.size === 1 
                  ? 'Sending...' 
                  : `Sending ${activeUploads.size} items...`}
              </span>
            </div>
          </div>
        )}
      </div>

      {isVideoRecording ? (
        <div className="flex flex-col border-t border-slate-700 safe-area-bottom">
          <div className="relative bg-black aspect-video max-h-[200px] w-full">
            <video 
              ref={videoPreviewRef}
              autoPlay 
              muted 
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3 bg-red-500/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span>REC {formatRecordingTime(recordingTime)}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 p-4 bg-slate-800">
            <button
              onClick={cancelVideoRecording}
              className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400"
              data-testid="button-cancel-video-recording"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={stopVideoRecording}
              className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white"
              data-testid="button-send-video-recording"
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : isRecording ? (
        <div className="flex items-center gap-4 p-4 bg-slate-800 border-t border-slate-700 safe-area-bottom">
          <button
            onClick={cancelRecording}
            className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400"
            data-testid="button-cancel-recording"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2" />
            <span className="text-white font-mono">{formatRecordingTime(recordingTime)}</span>
          </div>
          <button
            onClick={stopRecording}
            className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white"
            data-testid="button-stop-recording"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 bg-slate-900 border-t border-slate-800 safe-area-bottom">
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              data-testid="button-attach"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 min-w-[160px]">
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-2 text-white hover:bg-slate-700 text-left"
                  data-testid="button-attach-image"
                >
                  <Image className="w-5 h-5 text-emerald-400" />
                  <span>Photo</span>
                </button>
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-2 text-white hover:bg-slate-700 text-left"
                  data-testid="button-attach-video"
                >
                  <VideoIcon className="w-5 h-5 text-purple-400" />
                  <span>Video</span>
                </button>
                <button
                  onClick={() => {
                    setShowAttachMenu(false);
                    startVideoRecording();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-white hover:bg-slate-700 text-left"
                  data-testid="button-video-message"
                >
                  <Camera className="w-5 h-5 text-pink-400" />
                  <span>Video Message</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-2 text-white hover:bg-slate-700 text-left"
                  data-testid="button-attach-file"
                >
                  <File className="w-5 h-5 text-blue-400" />
                  <span>File</span>
                </button>
                <button
                  onClick={() => {
                    setShowAttachMenu(false);
                    setShowMemePicker(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-white hover:bg-slate-700 text-left"
                  data-testid="button-attach-meme"
                >
                  <ImageIcon className="w-5 h-5 text-orange-400" />
                  <span>Meme</span>
                </button>
              </div>
            )}
            
            {showMemePicker && (
              <MemePicker 
                onSelect={handleSendMeme}
                onClose={() => setShowMemePicker(false)}
              />
            )}
          </div>
          
          <div className="relative">
            <button
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowMemePicker(false);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              data-testid="button-emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            
            {showEmojiPicker && (
              <EmojiPicker 
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>
          
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files) {
                const maxFiles = Math.min(files.length, 50);
                for (let i = 0; i < maxFiles; i++) {
                  handleFileUpload(files[i], 'image');
                }
                if (files.length > 50) {
                  toast.info(`Uploading first 50 of ${files.length} images`);
                }
              }
              e.target.value = '';
            }}
          />
          <input
            type="file"
            ref={videoInputRef}
            accept="video/*,video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files) {
                const maxFiles = Math.min(files.length, 50);
                for (let i = 0; i < maxFiles; i++) {
                  handleFileUpload(files[i], 'video');
                }
                if (files.length > 50) {
                  toast.info(`Uploading first 50 of ${files.length} videos`);
                }
              }
              e.target.value = '';
            }}
          />
          <input
            type="file"
            ref={fileInputRef}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files) {
                const maxFiles = Math.min(files.length, 50);
                for (let i = 0; i < maxFiles; i++) {
                  handleFileUpload(files[i], 'file');
                }
                if (files.length > 50) {
                  toast.info(`Uploading first 50 of ${files.length} files`);
                }
              }
              e.target.value = '';
            }}
          />
          
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type a message..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            data-testid="input-message"
          />
          
          {inputText.trim() ? (
            <button
              onClick={handleSendText}
              className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white"
              data-testid="button-send"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              data-testid="button-record"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
      
      <MessageContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        isOwnMessage={contextMenu.message?.from_address === identity.address}
        messageContent={contextMenu.message?.content || ''}
        messageType={contextMenu.message?.type || 'text'}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, message: null })}
        onReact={handleContextMenuReact}
        onCopy={handleContextMenuCopy}
        onReply={handleContextMenuReply}
        onForward={handleContextMenuForward}
        onDelete={handleContextMenuDelete}
      />
      
      {lightbox && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(null)}
          data-testid="lightbox-overlay"
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30"
            style={{ touchAction: 'manipulation' }}
            data-testid="button-close-lightbox"
          >
            <X className="w-6 h-6" />
          </button>
          
          {lightbox.type === 'image' ? (
            <img 
              src={lightbox.url} 
              alt="Full size" 
              className="max-w-full max-h-full object-contain p-4"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video 
              src={lightbox.url} 
              controls
              autoPlay
              className="max-w-full max-h-full object-contain p-4"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
