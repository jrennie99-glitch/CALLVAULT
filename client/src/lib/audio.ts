let audioContext: AudioContext | null = null;
let isInitialized = false;
let currentRingtone: { intervalId: number | null; oscillators: OscillatorNode[] } | null = null;
let currentRingback: { intervalId: number | null; oscillators: OscillatorNode[] } | null = null;

export function initAudio(): void {
  if (isInitialized && audioContext) return;
  
  try {
    audioContext = new AudioContext();
    isInitialized = true;
    console.log('[Audio] AudioContext initialized, state:', audioContext.state);
    
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('[Audio] AudioContext resumed');
      }).catch(e => console.error('[Audio] Failed to resume:', e));
    }
  } catch (e) {
    console.error('[Audio] Failed to create AudioContext:', e);
  }
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
  
  const playTone = () => {
    if (!ctx || ctx.state !== 'running') return;
    
    try {
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 440;
      osc1.connect(gainNode);
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);
      
      if (currentRingtone) currentRingtone.oscillators.push(osc1);
      
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 554;
      osc2.connect(gainNode);
      
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.7);
      
      if (currentRingtone) currentRingtone.oscillators.push(osc2);
      
    } catch (e) {
      console.error('[Audio] Error playing ringtone:', e);
    }
  };
  
  playTone();
  currentRingtone.intervalId = window.setInterval(playTone, 2000);
  console.log('[Audio] Ringtone started');
}

export function stopRingtone(): void {
  if (currentRingtone) {
    if (currentRingtone.intervalId) {
      clearInterval(currentRingtone.intervalId);
    }
    currentRingtone.oscillators.forEach(osc => {
      try { osc.stop(); } catch {}
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
