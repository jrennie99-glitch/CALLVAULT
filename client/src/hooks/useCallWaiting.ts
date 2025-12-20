import { useState, useCallback } from 'react';
import type { WSMessage } from '@shared/types';

export interface WaitingCall {
  from_address: string;
  from_pubkey: string;
  media: { audio: boolean; video: boolean };
  receivedAt: number;
}

export function useCallWaiting(ws: WebSocket | null, myAddress: string) {
  const [waitingCalls, setWaitingCalls] = useState<WaitingCall[]>([]);
  const [isOnHold, setIsOnHold] = useState(false);
  const [heldBy, setHeldBy] = useState<string | null>(null);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'call:waiting':
        setWaitingCalls(prev => {
          if (prev.some(c => c.from_address === message.from_address)) {
            return prev;
          }
          return [...prev, {
            from_address: message.from_address,
            from_pubkey: message.from_pubkey,
            media: message.media,
            receivedAt: Date.now()
          }];
        });
        break;

      case 'call:held':
        setIsOnHold(true);
        setHeldBy(message.by_address);
        break;

      case 'call:resumed':
        setIsOnHold(false);
        setHeldBy(null);
        break;
    }
  }, []);

  const holdCurrentCall = useCallback((currentCallAddress: string) => {
    if (!ws) return;
    ws.send(JSON.stringify({
      type: 'call:hold',
      to_address: currentCallAddress
    } as WSMessage));
  }, [ws]);

  const resumeCall = useCallback((heldCallAddress: string) => {
    if (!ws) return;
    ws.send(JSON.stringify({
      type: 'call:resume',
      to_address: heldCallAddress
    } as WSMessage));
    setIsOnHold(false);
    setHeldBy(null);
  }, [ws]);

  const dismissWaitingCall = useCallback((address: string) => {
    setWaitingCalls(prev => prev.filter(c => c.from_address !== address));
  }, []);

  const acceptWaitingCall = useCallback((address: string) => {
    setWaitingCalls(prev => prev.filter(c => c.from_address !== address));
  }, []);

  const clearAll = useCallback(() => {
    setWaitingCalls([]);
    setIsOnHold(false);
    setHeldBy(null);
  }, []);

  return {
    waitingCalls,
    isOnHold,
    heldBy,
    hasWaitingCalls: waitingCalls.length > 0,
    handleMessage,
    holdCurrentCall,
    resumeCall,
    dismissWaitingCall,
    acceptWaitingCall,
    clearAll
  };
}
