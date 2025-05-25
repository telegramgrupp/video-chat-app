export interface User {
  id: string;
  coins: number;
  gender: string;
  country: string;
  last_seen: string;
  is_online: boolean;
}

export interface Match {
  id: string;
  peerA: string;
  peerB: string;
  isFake: boolean;
  created_at: string;
  ended_at: string | null;
}

export interface FakeVideo {
  id: string;
  gender: string;
  country: string;
  url: string;
  thumbnail_url: string;
}

export interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

export interface SocketEventMap {
  'user:join': (data: { userId: string }) => void;
  'user:leave': (data: { userId: string }) => void;
  'match:search': () => void;
  'match:cancel': () => void;
  'match:found': (data: { 
    peerId: string;
    matchId: string;
    quality: number;
    startTime: number;
  }) => void;
  'match:cancelled': () => void;
  'offer': (data: { userId: string; offer: RTCSessionDescriptionInit }) => void;
  'answer': (data: { userId: string; answer: RTCSessionDescriptionInit }) => void;
  'ice-candidate': (data: { userId: string; candidate: RTCIceCandidateInit }) => void;
}

export type Gender = 'male' | 'female' | 'both';
export type Region = 'TR' | 'US' | 'global';

export interface UserPreferences {
  gender: Gender;
  region: Region;
}