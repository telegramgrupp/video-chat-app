import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { 
  createPeerConnection, 
  addTracksToConnection, 
  createOffer, 
  createAnswer, 
  addIceCandidate, 
  handleConnectionStateChange
} from '../utils/webrtc';

interface VideoContextType {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isChatting: boolean;
  isSearching: boolean;
  isEnding: boolean;
  startChat: () => Promise<void>;
  endChat: () => void;
  error: Error | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  connectionStatus: string;
  toggleCamera: () => void;
  toggleMicrophone: () => void;
  switchCamera: () => void;
  setVideoQuality: (quality: 'low' | 'medium' | 'high') => void;
  isConnected: boolean;
  reconnect: () => Promise<void>;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}

const VideoContext = createContext<VideoContextType>({
  localStream: null,
  remoteStream: null,
  isChatting: false,
  isSearching: false,
  isEnding: false,
  startChat: async () => {},
  endChat: () => {},
  error: null,
  localVideoRef: React.createRef(),
  remoteVideoRef: React.createRef(),
  connectionStatus: 'new',
  toggleCamera: () => {},
  toggleMicrophone: () => {},
  switchCamera: () => {},
  setVideoQuality: () => {},
  isConnected: false,
  reconnect: async () => {},
  connectionState: 'new',
  iceConnectionState: 'new'
});

export const useVideo = () => useContext(VideoContext);

interface VideoProviderProps {
  children: React.ReactNode;
}

const MAX_RECONNECTION_ATTEMPTS = 3;
const RECONNECTION_DELAY = 2000;

export const VideoProvider: React.FC<VideoProviderProps> = ({ children }) => {
  const { user, preferences } = useAuth();
  const { socket, isConnected: socketConnected } = useSocket();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<RTCIceCandidateInit[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('new');
  const [isConnected, setIsConnected] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const retryTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectionAttempts = useRef(0);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [videoQuality, setVideoQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>('new');
  const [peerId, setPeerId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [matchQuality, setMatchQuality] = useState(0);

  // ... rest of your existing code (cleanupPeerConnection, setupPeerConnection, getVideoConstraints, etc.) ...

  const handlePeerConnectionStateChange = useCallback((pc: RTCPeerConnection) => {
    const state = pc.connectionState;
    setConnectionState(state);
    console.log(`Peer connection state changed to: ${state}`);

    switch (state) {
      case 'connected':
        setIsConnected(true);
        setError(null);
        reconnectionAttempts.current = 0;
        break;
      case 'disconnected':
      case 'failed':
        setIsConnected(false);
        if (reconnectionAttempts.current < MAX_RECONNECTION_ATTEMPTS) {
          console.log(`Connection ${state}, attempting reconnection...`);
          setTimeout(() => {
            reconnectionAttempts.current++;
            setupPeerConnection(pc.remoteDescription?.sdp || '');
          }, RECONNECTION_DELAY);
        } else {
          setError(new Error(`Connection ${state}. Max reconnection attempts reached.`));
          endChat();
        }
        break;
      case 'closed':
        setIsConnected(false);
        endChat();
        break;
    }
  }, []);

  const handleIceConnectionStateChange = useCallback((pc: RTCPeerConnection) => {
    const state = pc.iceConnectionState;
    setIceConnectionState(state);
    console.log(`ICE connection state changed to: ${state}`);

    switch (state) {
      case 'failed':
        console.error('ICE connection failed');
        setError(new Error('Network connection failed. Please check your internet connection.'));
        if (reconnectionAttempts.current < MAX_RECONNECTION_ATTEMPTS) {
          console.log('Attempting ICE restart...');
          pc.restartIce();
        } else {
          endChat();
        }
        break;
      case 'disconnected':
        console.warn('ICE connection disconnected');
        setError(new Error('Connection interrupted. Attempting to reconnect...'));
        break;
    }
  }, []);

  const reconnect = async () => {
    try {
      if (!peerConnection || !socket) {
        throw new Error('Cannot reconnect: connection not initialized');
      }

      console.log('Attempting to reconnect...');
      setError(null);

      // Close existing connection
      peerConnection.close();

      // Create new connection
      const newPc = await setupPeerConnection(socket.id);
      if (!newPc) {
        throw new Error('Failed to create new peer connection');
      }

      setPeerConnection(newPc);
    } catch (error) {
      console.error('Reconnection failed:', error);
      setError(error instanceof Error ? error : new Error('Reconnection failed'));
    }
  };

  // ... rest of your existing code (startChat, endChat, toggleCamera, etc.) ...

  return (
    <VideoContext.Provider
      value={{
        localStream,
        remoteStream,
        isChatting,
        isSearching,
        isEnding,
        startChat,
        endChat,
        error,
        localVideoRef,
        remoteVideoRef,
        connectionStatus,
        toggleCamera,
        toggleMicrophone,
        switchCamera,
        setVideoQuality: updateVideoQuality,
        isConnected,
        reconnect,
        connectionState,
        iceConnectionState
      }}
    >
      {children}
    </VideoContext.Provider>
  );
};