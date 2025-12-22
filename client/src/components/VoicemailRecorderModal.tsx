import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Send, X, StopCircle, Play, Pause, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { getContactByAddress } from '@/lib/storage';

interface VoicemailRecorderModalProps {
  isOpen: boolean;
  recipientAddress: string;
  senderAddress: string;
  senderName?: string;
  onClose: () => void;
  onSent: () => void;
}

export function VoicemailRecorderModal({ 
  isOpen, 
  recipientAddress, 
  senderAddress, 
  senderName,
  onClose, 
  onSent 
}: VoicemailRecorderModalProps) {
  const [mode, setMode] = useState<'choose' | 'audio' | 'text'>('choose');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const contact = getContactByAddress(recipientAddress);
  const recipientName = contact?.name || recipientAddress.slice(5, 17) + '...';
  
  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };
  
  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setMode('choose');
      setRecordedBlob(null);
      setRecordingDuration(0);
      setTextMessage('');
      setIsRecording(false);
      setIsPlaying(false);
    }
  }, [isOpen]);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
      toast.error('Could not access microphone');
    }
  };
  
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };
  
  const playRecording = () => {
    if (!recordedBlob) return;
    
    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };
  
  const pausePlayback = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const sendVoicemail = async () => {
    setIsSending(true);
    
    try {
      let audioData = '';
      let audioFormat = 'webm';
      
      if (mode === 'audio' && recordedBlob) {
        const reader = new FileReader();
        audioData = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(recordedBlob);
        });
      }
      
      const response = await fetch('/api/voicemails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress,
          senderAddress,
          senderName: senderName || 'Anonymous',
          messageType: mode === 'audio' ? 'audio' : 'text',
          audioData: mode === 'audio' ? audioData : undefined,
          audioFormat: mode === 'audio' ? audioFormat : undefined,
          durationSeconds: mode === 'audio' ? recordingDuration : 0,
          textContent: mode === 'text' ? textMessage : undefined,
        })
      });
      
      if (response.ok) {
        toast.success('Voicemail sent!');
        onSent();
        onClose();
      } else {
        throw new Error('Failed to send voicemail');
      }
    } catch (err) {
      console.error('Failed to send voicemail:', err);
      toast.error('Failed to send voicemail');
    } finally {
      setIsSending(false);
    }
  };
  
  const canSend = (mode === 'audio' && recordedBlob) || (mode === 'text' && textMessage.trim().length > 0);
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-amber-400" />
            Leave a Voicemail
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {recipientName} has Do Not Disturb enabled. Leave a message instead.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-2">
          {mode === 'choose' && (
            <div className="space-y-3">
              <Button
                className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 flex items-center gap-3"
                onClick={() => setMode('audio')}
                data-testid="button-voice-voicemail"
              >
                <Mic className="w-6 h-6" />
                <div className="text-left">
                  <p className="font-medium">Voice Message</p>
                  <p className="text-sm text-emerald-200">Record an audio message</p>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full h-16 border-slate-600 text-white hover:bg-slate-700 flex items-center gap-3"
                onClick={() => setMode('text')}
                data-testid="button-text-voicemail"
              >
                <MessageSquare className="w-6 h-6" />
                <div className="text-left">
                  <p className="font-medium">Text Message</p>
                  <p className="text-sm text-slate-400">Type a message instead</p>
                </div>
              </Button>
            </div>
          )}
          
          {mode === 'audio' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-lg">
                {!recordedBlob ? (
                  <>
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                      isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-700'
                    }`}>
                      {isRecording ? (
                        <StopCircle className="w-12 h-12 text-white" />
                      ) : (
                        <Mic className="w-12 h-12 text-white" />
                      )}
                    </div>
                    <p className="mt-4 text-2xl font-mono text-white">
                      {formatTime(recordingDuration)}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      {isRecording ? 'Recording...' : 'Tap to record'}
                    </p>
                    <Button
                      className={`mt-4 ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      onClick={isRecording ? stopRecording : startRecording}
                      data-testid={isRecording ? "button-stop-recording" : "button-start-recording"}
                    >
                      {isRecording ? 'Stop Recording' : 'Start Recording'}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      {isPlaying ? (
                        <Pause className="w-12 h-12 text-emerald-400" />
                      ) : (
                        <Play className="w-12 h-12 text-emerald-400" />
                      )}
                    </div>
                    <p className="mt-4 text-2xl font-mono text-white">
                      {formatTime(recordingDuration)}
                    </p>
                    <p className="text-emerald-400 text-sm mt-1">Recording complete</p>
                    <div className="flex gap-3 mt-4">
                      <Button
                        variant="outline"
                        className="border-slate-600 text-white"
                        onClick={isPlaying ? pausePlayback : playRecording}
                        data-testid="button-play-recording"
                      >
                        {isPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                        {isPlaying ? 'Pause' : 'Play'}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-slate-600 text-white"
                        onClick={() => {
                          setRecordedBlob(null);
                          setRecordingDuration(0);
                        }}
                        data-testid="button-rerecord"
                      >
                        Re-record
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {mode === 'text' && (
            <div className="space-y-4">
              <Textarea
                placeholder="Type your message..."
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                className="bg-slate-900/50 border-slate-700 text-white min-h-[120px] resize-none"
                data-testid="textarea-voicemail-message"
              />
              <p className="text-xs text-slate-500 text-right">
                {textMessage.length} / 500 characters
              </p>
            </div>
          )}
        </div>
        
        {mode !== 'choose' && (
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1 border-slate-600 text-white"
              onClick={() => setMode('choose')}
              data-testid="button-back-voicemail"
            >
              Back
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={sendVoicemail}
              disabled={!canSend || isSending}
              data-testid="button-send-voicemail"
            >
              <Send className="w-4 h-4 mr-2" />
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        )}
        
        {mode === 'choose' && (
          <Button
            variant="outline"
            className="w-full border-slate-600 text-white mt-2"
            onClick={onClose}
            data-testid="button-cancel-voicemail"
          >
            Cancel
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
