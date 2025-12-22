let audioContext: AudioContext | null = null;
let isInitialized = false;
let currentRingtone: { intervalId: number | null; oscillators: OscillatorNode[] } | null = null;
let currentRingback: { intervalId: number | null; oscillators: OscillatorNode[] } | null = null;
let hasUserGesture = false;

export function initAudio(): void {
  if (isInitialized && audioContext) return;
  
  try {
    audioContext = new AudioContext();
    isInitialized = true;
    console.log('[Audio] AudioContext initialized, state:', audioContext.state);
    
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('[Audio] AudioContext resumed');
        hasUserGesture = true;
      }).catch(e => console.error('[Audio] Failed to resume:', e));
    } else {
      hasUserGesture = true;
    }
  } catch (e) {
    console.error('[Audio] Failed to create AudioContext:', e);
  }
}

export async function unlockAudio(): Promise<boolean> {
  if (!audioContext) {
    initAudio();
  }
  
  if (!audioContext) return false;
  
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      console.log('[Audio] AudioContext unlocked by user gesture');
      hasUserGesture = true;
      
      const silentOsc = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      silentOsc.connect(gainNode);
      gainNode.connect(audioContext.destination);
      silentOsc.start();
      silentOsc.stop(audioContext.currentTime + 0.001);
      
      return true;
    } catch (e) {
      console.error('[Audio] Failed to unlock audio:', e);
      return false;
    }
  }
  
  hasUserGesture = true;
  return true;
}

export function isAudioUnlocked(): boolean {
  return hasUserGesture && audioContext?.state === 'running';
}

async function ensureAudioReady(): Promise<AudioContext | null> {
  if (!audioContext) {
    initAudio();
  }
  
  if (!audioContext) return null;
  
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      console.log('[Audio] Context resumed from suspended state');
    } catch (e) {
      console.error('[Audio] Failed to resume context:', e);
      return null;
    }
  }
  
  return audioContext;
}

export async function playRingtone(): Promise<void> {
  stopRingtone();
  
  const ctx = await ensureAudioReady();
  if (!ctx) {
    console.warn('[Audio] Cannot play ringtone - AudioContext not available');
    return;
  }
  
  currentRingtone = { intervalId: null, oscillators: [] };
  
  const playRingBurst = () => {
    if (!ctx || ctx.state !== 'running' || !currentRingtone) return;
    
    try {
      // Classic phone ring uses two frequencies: 440Hz and 480Hz (US standard)
      // Play a burst of rings (ring-ring pattern)
      const frequencies = [440, 480];
      const ringDuration = 0.4;
      const pauseBetweenRings = 0.2;
      
      // First ring
      for (let i = 0; i < 2; i++) {
        const startTime = ctx.currentTime + i * (ringDuration + pauseBetweenRings);
        
        frequencies.forEach(freq => {
          const gainNode = ctx.createGain();
          gainNode.connect(ctx.destination);
          
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.connect(gainNode);
          
          // Louder volume (0.6) with slight tremolo effect
          gainNode.gain.setValueAtTime(0.6, startTime);
          // Add slight tremolo for more realistic ring
          for (let t = 0; t < ringDuration * 20; t++) {
            const time = startTime + t * 0.02;
            const vol = 0.5 + 0.1 * Math.sin(t * 0.5);
            gainNode.gain.setValueAtTime(vol, time);
          }
          gainNode.gain.setValueAtTime(0.01, startTime + ringDuration);
          
          osc.start(startTime);
          osc.stop(startTime + ringDuration + 0.01);
          
          if (currentRingtone) currentRingtone.oscillators.push(osc);
        });
        
        // Add harmonics for richer sound
        const harmonicGain = ctx.createGain();
        harmonicGain.connect(ctx.destination);
        harmonicGain.gain.setValueAtTime(0.15, startTime);
        harmonicGain.gain.setValueAtTime(0.01, startTime + ringDuration);
        
        const harmonic = ctx.createOscillator();
        harmonic.type = 'triangle';
        harmonic.frequency.value = 880;
        harmonic.connect(harmonicGain);
        harmonic.start(startTime);
        harmonic.stop(startTime + ringDuration + 0.01);
        
        if (currentRingtone) currentRingtone.oscillators.push(harmonic);
      }
    } catch (e) {
      console.error('[Audio] Error playing ringtone:', e);
    }
  };
  
  playRingBurst();
  // Ring pattern: ring-ring, pause, ring-ring (every 3 seconds)
  currentRingtone.intervalId = window.setInterval(playRingBurst, 3000);
  console.log('[Audio] Ringtone started');
}

export function stopRingtone(): void {
  if (currentRingtone) {
    if (currentRingtone.intervalId) {
      clearInterval(currentRingtone.intervalId);
    }
    const now = audioContext?.currentTime || 0;
    currentRingtone.oscillators.forEach(osc => {
      try { 
        // Stop immediately or at current time (handles scheduled future oscillators)
        osc.stop(now); 
      } catch {
        // Ignore - oscillator may have already stopped or not started
      }
      try { osc.disconnect(); } catch {}
    });
    currentRingtone = null;
    console.log('[Audio] Ringtone stopped');
  }
}

export async function playRingback(): Promise<void> {
  stopRingback();
  
  const ctx = await ensureAudioReady();
  if (!ctx) {
    console.warn('[Audio] Cannot play ringback - AudioContext not available');
    return;
  }
  
  currentRingback = { intervalId: null, oscillators: [] };
  
  const playTone = () => {
    if (!ctx || ctx.state !== 'running') return;
    
    try {
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      osc.connect(gainNode);
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1);
      
      if (currentRingback) currentRingback.oscillators.push(osc);
      
      setTimeout(() => {
        if (!ctx || ctx.state !== 'running' || !currentRingback) return;
        
        const gainNode2 = ctx.createGain();
        gainNode2.connect(ctx.destination);
        
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 440;
        osc2.connect(gainNode2);
        
        gainNode2.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
        
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 1);
        
        if (currentRingback) currentRingback.oscillators.push(osc2);
      }, 1100);
      
    } catch (e) {
      console.error('[Audio] Error playing ringback:', e);
    }
  };
  
  playTone();
  currentRingback.intervalId = window.setInterval(playTone, 4000);
  console.log('[Audio] Ringback started');
}

export function stopRingback(): void {
  if (currentRingback) {
    if (currentRingback.intervalId) {
      clearInterval(currentRingback.intervalId);
    }
    currentRingback.oscillators.forEach(osc => {
      try { osc.stop(); } catch {}
      try { osc.disconnect(); } catch {}
    });
    currentRingback = null;
    console.log('[Audio] Ringback stopped');
  }
}

export function stopAllAudio(): void {
  stopRingtone();
  stopRingback();
}

export function getAudioState(): { initialized: boolean; state: AudioContextState | 'none' } {
  return {
    initialized: isInitialized,
    state: audioContext?.state || 'none'
  };
}
