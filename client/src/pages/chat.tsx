import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, Send, Paperclip, Mic, Image, File, X, Play, Pause, Check, CheckCheck, Users, MoreVertical, Phone, Video, VideoIcon, Camera } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { getContacts, type Contact } from '@/lib/storage';
import { getLocalMessages, saveLocalMessage, updateLocalMessageStatus, getLocalConversation, clearUnreadCount, getPrivacySettings, generateMessageId } from '@/lib/messageStorage';
import { signMessage } from '@/lib/crypto';
import type { Message, Conversation, CryptoIdentity, WSMessage, MessageType } from '@shared/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ChatPageProps {
  identity: CryptoIdentity;
  ws: WebSocket | null;
  onBack: () => void;
  convo: Conversation;
  onStartCall: (address: string, video: boolean) => void;
}

export function ChatPage({ identity, ws, onBack, convo, onStartCall }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
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
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, convo.id, identity.address, privacySettings]);

  const loadMessages = () => {
    const localMsgs = getLocalMessages(convo.id);
    setMessages(localMsgs);
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

    const signedMessage = await signMessage(identity, message);
    ws.send(JSON.stringify({
      type: 'msg:send',
      data: signedMessage
    }));

    message.status = 'sent';
    saveLocalMessage(message);
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'sent' } : m));
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

  const handleFileUpload = async (file: File, type: 'image' | 'file' | 'video') => {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
          'X-Filename': file.name
        }
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      
      const { url, name, size } = await res.json();
      sendMessage(type, '', url, name, size);
      setShowAttachMenu(false);
    } catch (error) {
      toast.error('Failed to upload file');
      console.error(error);
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

  const renderMessageStatus = (msg: Message) => {
    if (msg.from_address !== identity.address) return null;
    switch (msg.status) {
      case 'sending': return <span className="text-slate-500 text-xs">○</span>;
      case 'sent': return <Check className="w-3 h-3 text-slate-400" />;
      case 'delivered': return <CheckCheck className="w-3 h-3 text-slate-400" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-emerald-400" />;
      default: return null;
    }
  };

  const renderAttachment = (msg: Message) => {
    if (msg.type === 'image' && msg.attachment_url) {
      return (
        <img 
          src={msg.attachment_url} 
          alt="Shared image" 
          className="max-w-[250px] rounded-lg cursor-pointer"
          onClick={() => window.open(msg.attachment_url, '_blank')}
        />
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
        <video 
          src={msg.attachment_url} 
          controls
          className="max-w-[280px] rounded-lg"
          preload="metadata"
        />
      );
    }
    
    if (msg.type === 'video_message' && msg.attachment_url) {
      return (
        <div className="relative">
          <video 
            src={msg.attachment_url} 
            controls
            className="max-w-[200px] rounded-xl"
            preload="metadata"
          />
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Camera className="w-3 h-3" />
            <span>Video message</span>
          </div>
        </div>
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
          {remoteTyping && (
            <div className="text-xs text-emerald-400">typing...</div>
          )}
        </div>
        
        {convo.type === 'direct' && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          const isMe = msg.from_address === identity.address;
          const showAvatar = !isMe && (idx === 0 || messages[idx - 1].from_address !== msg.from_address);
          
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
            >
              {!isMe && showAvatar && convo.type === 'group' && (
                <Avatar name={getContactName(msg.from_address)} address={msg.from_address} size="xs" />
              )}
              {!isMe && !showAvatar && convo.type === 'group' && <div className="w-6" />}
              
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  isMe
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-slate-800 text-white rounded-bl-md'
                }`}
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
          );
        })}
        <div ref={messagesEndRef} />
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
              </div>
            )}
          </div>
          
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, 'image');
              e.target.value = '';
            }}
          />
          <input
            type="file"
            ref={videoInputRef}
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, 'video');
              e.target.value = '';
            }}
          />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, 'file');
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
    </div>
  );
}
