import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  isConnected: false
});

export const useVideo = () => useContext(VideoContext);

interface VideoProviderProps {
  children: React.ReactNode;
}

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
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [videoQuality, setVideoQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [peerId, setPeerId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [matchQuality, setMatchQuality] = useState(0);

  const cleanupPeerConnection = () => {
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }
    setPendingCandidates([]);
  };

  const setupPeerConnection = useCallback(async (peerId: string) => {
    try {
      if (!localStreamRef.current) {
        throw new Error('Local stream is not available');
      }

      if (!socket?.id) {
        throw new Error('Socket ID is not available');
      }

      console.log('Setting up peer connection for:', peerId);
      console.log('Local stream available:', !!localStreamRef.current);

      const connection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });

      // Bağlantı durumu değişikliklerini izle
      connection.onconnectionstatechange = () => {
        console.log('Connection state changed to:', connection.connectionState);
        if (connection.connectionState === 'connected') {
          setError(null);
          setIsConnected(true);
          setConnectionStatus('connected');
        } else if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
          setIsConnected(false);
          setConnectionStatus('disconnected');
          setError(new Error('Bağlantı kesildi. Yeniden bağlanılıyor...'));
          
          // Bağlantıyı yeniden kurmayı dene
          setTimeout(() => {
            if (connection.connectionState !== 'connected') {
              console.log('Attempting to reconnect...');
              setupPeerConnection(peerId);
            }
          }, 2000);
        }
      };

      // ICE bağlantı durumunu izle
      connection.oniceconnectionstatechange = () => {
        console.log('ICE connection state changed to:', connection.iceConnectionState);
        if (connection.iceConnectionState === 'connected') {
          setError(null);
          setIsConnected(true);
          setConnectionStatus('connected');
        } else if (connection.iceConnectionState === 'disconnected' || connection.iceConnectionState === 'failed') {
          setIsConnected(false);
          setConnectionStatus('disconnected');
          setError(new Error('ICE bağlantısı kesildi. Yeniden bağlanılıyor...'));
          
          // ICE bağlantısını yeniden kurmayı dene
          setTimeout(() => {
            if (connection.iceConnectionState !== 'connected') {
              console.log('Attempting to reconnect ICE...');
              setupPeerConnection(peerId);
            }
          }, 2000);
        }
      };

      // Sinyal durumunu izle
      connection.onsignalingstatechange = () => {
        console.log('Signaling state changed to:', connection.signalingState);
      };

      // ICE adaylarını işle
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to peer:', event.candidate);
          socket?.emit('webrtc:ice-candidate', {
            candidate: event.candidate,
            to: peerId
          });
        }
      };

      // Uzak medya akışını işle
      connection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        if (event.streams[0]) {
          setRemoteStream(event.streams[0]);
          const remoteVideo = remoteVideoRef.current;
          if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
            // Video oynatmayı dene
            const tryPlay = (retry = 0) => {
              remoteVideo.play().catch(error => {
                console.error('Error playing remote video:', error);
                if (retry < 3) {
                  setTimeout(() => tryPlay(retry + 1), 1000);
                }
              });
            };
            tryPlay();
          }
        }
      };

      // Yerel medya akışını ekle
      console.log('📤 Local tracks being sent:', localStreamRef.current.getTracks());
      localStreamRef.current.getTracks().forEach(track => {
        connection.addTrack(track, localStreamRef.current!);
      });
      console.log('✅ Added tracks to connection');

      // Offer/Answer mantığını uygula
      const shouldCreateOffer = socket.id > peerId;
      console.log('Should create offer:', shouldCreateOffer, `(${socket.id} vs ${peerId})`);

      if (shouldCreateOffer) {
        try {
          const offer = await connection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await connection.setLocalDescription(offer);
          console.log('Sending offer to peer');
          socket?.emit('webrtc:offer', {
            offer,
            to: peerId
          });
        } catch (error) {
          console.error('Error creating offer:', error);
          setError(new Error('Bağlantı kurulamadı. Lütfen tekrar deneyin.'));
        }
      } else {
        console.log('Waiting for offer from peer...');
      }

      // Bağlantıyı sakla
      setPeerConnection(connection);

      return connection;
    } catch (error) {
      console.error('Error in setupPeerConnection:', error);
      setError(new Error('Bağlantı kurulamadı. Lütfen tekrar deneyin.'));
      return null;
    }
  }, [socket]);

  const getVideoConstraints = useCallback(() => {
    const baseConstraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    switch (videoQuality) {
      case 'low':
        return {
          ...baseConstraints,
          video: {
            ...baseConstraints.video,
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        };
      case 'high':
        return {
          ...baseConstraints,
          video: {
            ...baseConstraints.video,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };
      default:
        return baseConstraints;
    }
  }, [videoQuality]);

  const toggleCamera = useCallback(async () => {
    if (!localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraEnabled(videoTrack.enabled);
    }
  }, []);

  const toggleMicrophone = useCallback(async () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicrophoneEnabled(audioTrack.enabled);
    }
  }, []);

  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current || availableCameras.length < 2) return;

    const nextCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextCameraIndex];

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: nextCamera.deviceId },
          ...getVideoConstraints().video
        },
        audio: getVideoConstraints().audio
      });

      // Eski video track'i kapat
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
      }

      // Yeni video track'i ekle
      const newVideoTrack = newStream.getVideoTracks()[0];
      localStreamRef.current.addTrack(newVideoTrack);

      // Peer connection'a yeni track'i ekle
      if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      setCurrentCameraIndex(nextCameraIndex);
    } catch (err) {
      console.error('Error switching camera:', err);
      setError(new Error('Kamera değiştirilemedi. Lütfen tekrar deneyin.'));
    }
  }, [availableCameras, currentCameraIndex, peerConnection, getVideoConstraints]);

  const updateVideoQuality = useCallback(async (quality: 'low' | 'medium' | 'high') => {
    if (!localStreamRef.current) return;

    setVideoQuality(quality);
    const constraints = getVideoConstraints();

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Eski video track'i kapat
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
      }

      // Yeni video track'i ekle
      localStreamRef.current.addTrack(newVideoTrack);

      // Peer connection'a yeni track'i ekle
      if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.error('Error updating video quality:', err);
      setError(new Error('Video kalitesi değiştirilemedi. Lütfen tekrar deneyin.'));
    }
  }, [peerConnection, getVideoConstraints]);

  // Kamera listesini al
  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(videoDevices);
      } catch (err) {
        console.error('Error getting cameras:', err);
      }
    };

    getCameras();
  }, []);

  const startChat = async () => {
    try {
      if (!socket || !socketConnected) {
        throw new Error('Socket connection not available');
      }

      setError(null);
      setIsSearching(true);
      setIsEnding(false);

      if (!localStreamRef.current) {
        try {
          console.log("Requesting user media");
          const stream = await navigator.mediaDevices.getUserMedia(getVideoConstraints());
          
          console.log("User media acquired:", stream.id);
          setLocalStream(stream);
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch (err: any) {
          if (err.name === 'NotAllowedError') {
            throw new Error('Please allow camera and microphone access to use video chat.');
          } else {
            throw err;
          }
        }
      }

      console.log("Starting match search with preferences:", preferences);
      console.log("Current socket state:", {
        id: socket.id,
        connected: socket.connected,
        isSearching,
        isEnding
      });

      socket.emit('match:search', preferences);

    } catch (err) {
      console.error("Error in startChat:", err);
      setError(err instanceof Error ? err : new Error('Failed to start chat'));
      setIsSearching(false);
      endChat();
    }
  };

  const endChat = () => {
    if (isEnding) return;
    
    setIsEnding(true);
    
    if (socket && socketConnected) {
      socket.emit('match:cancel');
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (remoteStreamTimeout.current) {
      clearTimeout(remoteStreamTimeout.current);
      remoteStreamTimeout.current = null;
    }

    if (retryTimeout.current) {
      clearTimeout(retryTimeout.current);
      retryTimeout.current = null;
    }

    cleanupPeerConnection();
    setIsChatting(false);
    setIsSearching(false);
    setError(null);
    setIsEnding(false);
  };

  const handleConnectionError = (error: Error) => {
    console.error('Connection error:', error);
    setError(new Error('Bağlantı hatası oluştu. Yeniden bağlanmayı deneyebilirsiniz.'));
    endChat();
  };

  const handleReconnect = () => {
    if (!socket || !socketConnected) return;
    
    setError(null);
    setIsSearching(true);
    socket.emit('match:search', { retry: true });
  };

  const handleMatchFound = useCallback(async (data: { peerId: string; matchId: string; quality: number; startTime: number }) => {
    console.log('Match found with peer:', data.peerId, 'Match ID:', data.matchId, 'Quality:', data.quality, 'Start Time:', data.startTime);
    
    // Validate match data
    if (!data.peerId || !data.matchId || typeof data.quality !== 'number' || !data.startTime) {
      console.error('Invalid match data received:', data);
      setError(new Error('Invalid match data received. Please try again.'));
      endChat();
      return;
    }
    
    setPeerId(data.peerId);
    setMatchId(data.matchId);
    setMatchQuality(data.quality);
    setIsSearching(false);
    setIsConnected(false);
    setConnectionStatus('connecting');

    // Ensure localStream is available
    if (!localStreamRef.current) {
      console.error('Local stream not available');
      setError(new Error('Local stream not available'));
      return;
    }

    console.log('Match found, ensuring localStream is available...');
    console.log('LocalStream tracks:', localStreamRef.current.getTracks().map(t => t.kind));

    // Proceed with peer connection setup
    console.log('LocalStream confirmed, proceeding with peer connection setup');
    await setupPeerConnection(data.peerId);
  }, [setupPeerConnection, endChat]);

  useEffect(() => {
    if (!socket) return;

    const handleOffer = async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
      try {
        console.log('Received offer from:', from);
        if (!offer || !offer.type) {
          throw new Error('Invalid offer received');
        }

        const pc = await setupPeerConnection(from);
        if (!pc) return;

        console.log('Setting remote description (offer)');
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        console.log('Creating answer');
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        console.log('Setting local description (answer)');
        await pc.setLocalDescription(answer);
        
        console.log('Sending answer to peer');
        socket?.emit('webrtc:answer', { 
          answer,
          to: from 
        });

        // remoteDescription set edildikten sonra tüm pending ICE candidate'ları ekle
        for (const candidate of pendingCandidates) {
          try {
            console.log('Adding pending ICE candidate after remoteDescription set');
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
        setPendingCandidates([]);

        setIsChatting(true);
        setIsSearching(false);
      } catch (err) {
        console.error('Error handling offer:', err);
        endChat();
      }
    };

    const handleAnswer = async ({ answer, from }: { answer: RTCSessionDescriptionInit; from: string }) => {
      try {
        console.log('Received answer from:', from);
        if (!peerConnection) {
          throw new Error('No peer connection available');
        }

        if (!answer || !answer.type) {
          throw new Error('Invalid answer received');
        }

        const signalingState = peerConnection.signalingState;
        console.log('Current signaling state:', signalingState);

        if (signalingState === 'stable') {
          console.log('Connection already stable, ignoring answer');
          return;
        }

        if (signalingState !== 'have-local-offer') {
          throw new Error(`Invalid signaling state for setting remote answer: ${signalingState}`);
        }

        console.log('Setting remote description (answer)');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

        // remoteDescription set edildikten sonra tüm pending ICE candidate'ları ekle
        for (const candidate of pendingCandidates) {
          try {
            console.log('Adding pending ICE candidate after remoteDescription set');
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
        setPendingCandidates([]);
        
        setIsChatting(true);
        setIsSearching(false);
      } catch (err) {
        console.error('Error handling answer:', err);
        endChat();
      }
    };

    const handleIceCandidate = async ({ candidate, from }: { candidate: RTCIceCandidateInit; from: string }) => {
      try {
        console.log('Received ICE candidate from:', from);
        if (!candidate) return;

        // Her zaman kuyruğa ekle, remoteDescription geldiğinde flush et
        setPendingCandidates(prev => [...prev, candidate]);

        if (peerConnection && peerConnection.remoteDescription) {
          // Kuyruğu flush et
          for (const cand of pendingCandidates.concat([candidate])) {
            try {
              console.log('Adding ICE candidate to peer connection');
              await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.error('Error adding ICE candidate:', err);
            }
          }
          setPendingCandidates([]);
        }
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
      }
    };

    socket.on('match:found', handleMatchFound);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('match:cancelled', endChat);

    return () => {
      socket.off('match:found', handleMatchFound);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('match:cancelled', endChat);
    };
  }, [socket, peerConnection, pendingCandidates]);

  useEffect(() => {
    return () => {
      endChat();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
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
        isConnected
      }}
    >
      {children}
    </VideoContext.Provider>
  );
};