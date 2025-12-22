import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Video, Volume2, Check, X, AlertTriangle, Camera, RefreshCw } from 'lucide-react';

interface PreCallCheckModalProps {
  isOpen: boolean;
  isVideoCall: boolean;
  onProceed: (config: { audioDeviceId?: string; videoDeviceId?: string }) => void;
  onCancel: () => void;
}

type TestStatus = 'pending' | 'testing' | 'success' | 'error';

export function PreCallCheckModal({ isOpen, isVideoCall, onProceed, onCancel }: PreCallCheckModalProps) {
  const [micStatus, setMicStatus] = useState<TestStatus>('pending');
  const [cameraStatus, setCameraStatus] = useState<TestStatus>('pending');
  const [speakerStatus, setSpeakerStatus] = useState<TestStatus>('pending');
  const [micLevel, setMicLevel] = useState(0);
  const [skipNextTime, setSkipNextTime] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);
  
  const getDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  };
  
  const startMicTest = async () => {
    setMicStatus('testing');
    setPermissionError(null);
    
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 128) * 100);
        setMicLevel(normalizedLevel);
        
        if (normalizedLevel > 5) {
          setMicStatus('success');
        }
        
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      await getDevices();
      
    } catch (err: any) {
      console.error('Mic test error:', err);
      setMicStatus('error');
      if (err.name === 'NotAllowedError') {
        setPermissionError('Microphone permission denied. Please allow access in your browser settings.');
      } else {
        setPermissionError('Could not access microphone: ' + err.message);
      }
    }
  };
  
  const startCameraTest = async () => {
    if (!isVideoCall) {
      setCameraStatus('success');
      return;
    }
    
    setCameraStatus('testing');
    
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (streamRef.current) {
        stream.getVideoTracks().forEach(track => streamRef.current!.addTrack(track));
      } else {
        streamRef.current = stream;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setCameraStatus('success');
      await getDevices();
      
    } catch (err: any) {
      console.error('Camera test error:', err);
      setCameraStatus('error');
      if (err.name === 'NotAllowedError') {
        setPermissionError('Camera permission denied. Please allow access in your browser settings.');
      }
    }
  };
  
  const playSpeakerTest = async () => {
    setSpeakerStatus('testing');
    
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
        setSpeakerStatus('success');
      }, 500);
      
    } catch (err) {
      console.error('Speaker test error:', err);
      setSpeakerStatus('error');
    }
  };
  
  const handleProceed = () => {
    if (skipNextTime) {
      localStorage.setItem('cv_skip_precall_check', 'true');
    }
    
    cleanup();
    onProceed({
      audioDeviceId: selectedAudioDevice || undefined,
      videoDeviceId: selectedVideoDevice || undefined
    });
  };
  
  const handleCancel = () => {
    cleanup();
    onCancel();
  };
  
  const switchCamera = async () => {
    const currentIndex = videoDevices.findIndex(d => d.deviceId === selectedVideoDevice);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];
    
    if (nextDevice && streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => track.stop());
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextDevice.deviceId } }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        
        setSelectedVideoDevice(nextDevice.deviceId);
      } catch (err) {
        console.error('Failed to switch camera:', err);
      }
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      setMicStatus('pending');
      setCameraStatus('pending');
      setSpeakerStatus('pending');
      setMicLevel(0);
      setPermissionError(null);
      
      const savedSkip = localStorage.getItem('cv_skip_precall_check');
      setSkipNextTime(savedSkip === 'true');
      
      getDevices();
      startMicTest();
      if (isVideoCall) {
        startCameraTest();
      }
    } else {
      cleanup();
    }
    
    return cleanup;
  }, [isOpen, isVideoCall, cleanup]);
  
  const canProceed = micStatus === 'success' && (!isVideoCall || cameraStatus === 'success');
  const canProceedWithWarning = micStatus !== 'pending' && (!isVideoCall || cameraStatus !== 'pending');
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            Pre-Call Device Check
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Make sure your devices are working before starting the call.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {permissionError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{permissionError}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Mic className={`w-5 h-5 ${
                  micStatus === 'success' ? 'text-green-400' : 
                  micStatus === 'error' ? 'text-red-400' : 'text-slate-400'
                }`} />
                <div>
                  <p className="text-white font-medium">Microphone</p>
                  <p className="text-xs text-slate-500">
                    {micStatus === 'testing' ? 'Speak to test...' :
                     micStatus === 'success' ? 'Working' :
                     micStatus === 'error' ? 'Not available' : 'Checking...'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {micStatus === 'testing' || micStatus === 'success' ? (
                  <div className="w-24">
                    <Progress value={micLevel} className="h-2" />
                  </div>
                ) : null}
                {micStatus === 'success' && <Check className="w-5 h-5 text-green-400" />}
                {micStatus === 'error' && <X className="w-5 h-5 text-red-400" />}
              </div>
            </div>
            
            {audioDevices.length > 1 && (
              <Select value={selectedAudioDevice} onValueChange={(val) => {
                setSelectedAudioDevice(val);
                cleanup();
                setTimeout(startMicTest, 100);
              }}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white" data-testid="select-audio-device">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {audioDevices.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId} className="text-white">
                      {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {isVideoCall && (
            <div className="space-y-3">
              <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  data-testid="video-preview"
                />
                {cameraStatus !== 'success' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                    {cameraStatus === 'testing' && (
                      <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                    )}
                    {cameraStatus === 'error' && (
                      <div className="text-center">
                        <Video className="w-8 h-8 text-red-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Camera not available</p>
                      </div>
                    )}
                  </div>
                )}
                {videoDevices.length > 1 && cameraStatus === 'success' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute bottom-2 right-2 bg-slate-800/80 text-white"
                    onClick={switchCamera}
                    data-testid="button-switch-camera"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Switch
                  </Button>
                )}
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Volume2 className={`w-5 h-5 ${
                speakerStatus === 'success' ? 'text-green-400' : 'text-slate-400'
              }`} />
              <div>
                <p className="text-white font-medium">Speakers</p>
                <p className="text-xs text-slate-500">
                  {speakerStatus === 'success' ? 'Test complete' : 'Play a test sound'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={playSpeakerTest}
              disabled={speakerStatus === 'testing'}
              className="text-white border-slate-600"
              data-testid="button-test-speakers"
            >
              {speakerStatus === 'success' ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                'Test'
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="skip-next"
              checked={skipNextTime}
              onCheckedChange={(checked) => setSkipNextTime(checked === true)}
              className="border-slate-600"
              data-testid="checkbox-skip-next"
            />
            <Label htmlFor="skip-next" className="text-sm text-slate-400 cursor-pointer">
              Skip this check next time
            </Label>
          </div>
        </div>
        
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1 text-white border-slate-600"
            onClick={handleCancel}
            data-testid="button-cancel-precall"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleProceed}
            disabled={!canProceedWithWarning}
            data-testid="button-proceed-call"
          >
            {canProceed ? 'Start Call' : 'Proceed Anyway'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
