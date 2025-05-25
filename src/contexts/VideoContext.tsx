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

  const setupPeerConnection = useCallback(async (socketId: string) => {
    if (!socket) {
      throw new Error('Socket connection not available');
    }

    const pc = await createPeerConnection();
    if (!pc) {
      throw new Error('Failed to create peer connection');
    }

    setPeerConnection(pc);
    return pc;
  }, [socket]);

  const startChat = useCallback(async () => {
    try {
      if (!socket || !socketConnected) {
        throw new Error('Socket connection not available');
      }

      setIsSearching(true);
      setError(null);

      // Initialize peer connection
      const pc = await setupPeerConnection(socket.id);
      if (!pc) {
        throw new Error('Failed to create peer connection');
      }

      // Add local tracks to the connection
      if (localStreamRef.current) {
        await addTracksToConnection(pc, localStreamRef.current);
      }

      // Create and send offer
      const offer = await createOffer(pc);
      socket.emit('match:start', { offer });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('match:ice-candidate', { candidate: event.candidate });
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => handlePeerConnectionStateChange(pc);
      pc.oniceconnectionstatechange = () => handleIceConnectionStateChange(pc);

      // Handle incoming stream
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start chat'));
      setIsSearching(false);
    }
  }, [socket, socketConnected, setupPeerConnection]);

  const endChat = useCallback(() => {
    setIsEnding(true);
    
    // Clean up peer connection
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }

    // Reset streams
    setRemoteStream(null);
    
    // Reset states
    setIsChatting(false);
    setIsSearching(false);
    setIsEnding(false);
    setError(null);
    
    // Notify server
    if (socket) {
      socket.emit('match:end');
    }
  }, [peerConnection, socket]);

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

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraEnabled(videoTrack.enabled);
      }
    }
  }, []);

  const toggleMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicrophoneEnabled(audioTrack.enabled);
      }
    }
  }, []);

  const switchCamera = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      if (videoDevices.length > 1) {
        const nextIndex = (currentCameraIndex + 1) % videoDevices.length;
        setCurrentCameraIndex(nextIndex);
        
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoDevices[nextIndex].deviceId } },
          audio: true
        });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        
        setLocalStream(newStream);
        localStreamRef.current = newStream;
        
        if (peerConnection) {
          const senders = peerConnection.getSenders();
          const videoSender = senders.find(sender => sender.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      setError(error instanceof Error ? error : new Error('Failed to switch camera'));
    }
  }, [currentCameraIndex, peerConnection]);

  const updateVideoQuality = useCallback((quality: 'low' | 'medium' | 'high') => {
    setVideoQuality(quality);
    // Implement video quality adjustment logic here
  }, []);

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