export interface CryptoIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  address: string;
  publicKeyBase58: string;
}

export interface CallIntent {
  from_pubkey: string;
  from_address: string;
  to_address: string;
  timestamp: number;
  nonce: string;
  media: {
    audio: boolean;
    video: boolean;
  };
}

export interface SignedCallIntent {
  intent: CallIntent;
  signature: string;
}

export type WSMessage =
  | { type: 'register'; address: string }
  | { type: 'call:init'; data: SignedCallIntent }
  | { type: 'call:incoming'; from_address: string; from_pubkey: string; media: { audio: boolean; video: boolean } }
  | { type: 'call:accept'; to_address: string }
  | { type: 'call:reject'; to_address: string }
  | { type: 'call:end'; to_address: string }
  | { type: 'webrtc:offer'; to_address: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc:answer'; to_address: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc:ice'; to_address: string; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };
