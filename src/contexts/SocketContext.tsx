import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketEventMap } from '../types';

// Log Socket.IO environment variables
console.log('Socket.IO Environment Variables Check:');
console.log('VITE_SOCKET_URL:', import.meta.env.VITE_SOCKET_URL);
console.log('VITE_CLIENT_URL:', import.meta.env.VITE_CLIENT_URL);

interface Match {
  id: string;
  peerId: string;
  quality: number;
  startTime: Date;
}

interface MatchPreferences {
  gender: 'male' | 'female' | 'both';
  region: string;
  ageRange?: [number, number];
  interests?: string[];
  language?: string[];
  isPremium?: boolean;
}

interface MatchStats {
  totalMatches: number;
  successfulMatches: number;
  averageWaitTime: number;
  lastMatchAt: Date | null;
}

interface MatchData {
  peerId: string;
  matchId: string;
  quality: number;
  startTime: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  error: Error | null;
  startSearching: (preferences?: MatchPreferences) => void;
  stopSearching: () => void;
  isSearching: boolean;
  skipCurrentMatch: () => void;
  reportUser: (reason: string) => void;
  likeUser: () => void;
  matchStats: MatchStats;
  currentMatchId: string | null;
  isPremium: boolean;
  setPremium: (isPremium: boolean) => void;
  blockUser: (userId: string) => void;
  getBlockedUsers: () => string[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  error: null,
  startSearching: () => {},
  stopSearching: () => {},
  isSearching: false,
  skipCurrentMatch: () => {},
  reportUser: () => {},
  likeUser: () => {},
  matchStats: {
    totalMatches: 0,
    successfulMatches: 0,
    averageWaitTime: 0,
    lastMatchAt: null
  },
  currentMatchId: null,
  isPremium: false,
  setPremium: () => {},
  blockUser: () => {},
  getBlockedUsers: () => []
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats>({
    totalMatches: 0,
    successfulMatches: 0,
    averageWaitTime: 0,
    lastMatchAt: null
  });
  const [isPremium, setIsPremium] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const savedBlockedUsers = localStorage.getItem('blockedUsers');
    if (savedBlockedUsers) {
      setBlockedUsers(JSON.parse(savedBlockedUsers));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  const blockUser = useCallback((userId: string) => {
    setBlockedUsers(prev => [...prev, userId]);
    if (currentMatch?.id === userId) {
      skipCurrentMatch();
    }
  }, [currentMatch]);

  const getBlockedUsers = useCallback(() => {
    return blockedUsers;
  }, []);

  const updateMatchStats = useCallback((newMatch: boolean) => {
    setMatchStats(prev => {
      const now = new Date();
      const totalMatches = prev.totalMatches + 1;
      const successfulMatches = newMatch ? prev.successfulMatches + 1 : prev.successfulMatches;
      
      let averageWaitTime = prev.averageWaitTime;
      if (currentMatch?.startTime) {
        const waitTime = Date.now() - currentMatch.startTime.getTime();
        averageWaitTime = (prev.averageWaitTime * prev.totalMatches + waitTime) / totalMatches;
      }

      return {
        totalMatches,
        successfulMatches,
        averageWaitTime,
        lastMatchAt: now
      };
    });
  }, [currentMatch]);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) {
      console.error('Socket URL not found in environment variables');
      return;
    }

    console.log('Attempting to connect to socket server:', socketUrl);
      
    const newSocket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'], // Prioritize websocket over polling
      path: '/socket.io/',
      withCredentials: true,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true,
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      extraHeaders: {
        'Origin': import.meta.env.VITE_CLIENT_URL || window.location.origin
      }
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('📡 Socket connected:', newSocket.id);
      setIsConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError(new Error('Connection error: ' + err.message));
      setIsConnected(false);
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        console.log(`Reconnection attempt ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
      } else {
        console.error('Max reconnection attempts reached');
        setError(new Error('Maximum reconnection attempts reached. Please refresh the page.'));
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
        
      if (reason === 'io server disconnect' || reason === 'transport close') {
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`Reconnection attempt ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
          
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          reconnectTimeout.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            if (socketRef.current) {
              socketRef.current.connect();
            }
          }, 2000);
        } else {
          console.error('Max reconnection attempts reached');
          setError(new Error('Maximum reconnection attempts reached. Please refresh the page.'));
        }
      }
    });

    newSocket.on('match:found', (data: MatchData) => {
      console.log('🤝 Match found event received:', data);
      
      if (!data || typeof data !== 'object') {
        console.error('Invalid match data received: not an object');
        setError(new Error('Invalid match data received.'));
        return;
      }
      
      const { peerId, matchId, quality, startTime } = data;
      
      if (!peerId || typeof peerId !== 'string') {
        console.error('Invalid peerId in match data:', peerId);
        setError(new Error('Invalid match data received.'));
        return;
      }
      
      if (!matchId || typeof matchId !== 'string') {
        console.error('Invalid matchId in match data:', matchId);
        setError(new Error('Invalid match data received.'));
        return;
      }
      
      if (typeof quality !== 'number' || isNaN(quality)) {
        console.error('Invalid quality in match data:', quality);
        setError(new Error('Invalid match data received.'));
        return;
      }
      
      if (!startTime || typeof startTime !== 'number' || isNaN(startTime)) {
        console.error('Invalid startTime in match data:', startTime);
        setError(new Error('Invalid match data received.'));
        return;
      }
      
      setCurrentMatch({
        id: matchId,
        peerId: peerId,
        quality: quality,
        startTime: new Date(startTime)
      });
      
      setIsSearching(false);
      updateMatchStats(true);
      
      if (quality < 0.5) {
        setError(new Error('Low quality match. You may want to skip.'));
      }
    });

    newSocket.on('match:cancelled', () => {
      console.log('⏹️ Match cancelled by peer');
      setCurrentMatch(null);
      setIsSearching(false);
      updateMatchStats(false);
    });

    newSocket.on('match:timeout', () => {
      console.log('⏰ Match search timed out');
      setError(new Error('Match search timed out. Please try again.'));
      setIsSearching(false);
    });

    newSocket.on('match:error', (error) => {
      console.error('❌ Match error:', error);
      setError(new Error(error.message || 'An error occurred during matching.'));
      setIsSearching(false);
    });

    newSocket.on('webrtc:offer', (data) => {
      console.log('📥 Received WebRTC offer:', data);
      if (!data.offer || !data.from) {
        console.error('Invalid offer data received:', data);
        return;
      }
    });

    newSocket.on('webrtc:answer', (data) => {
      console.log('📥 Received WebRTC answer:', data);
      if (!data.answer || !data.from) {
        console.error('Invalid answer data received:', data);
        return;
      }
    });

    newSocket.on('webrtc:ice-candidate', (data) => {
      console.log('📥 Received ICE candidate:', data);
      if (!data.candidate || !data.from) {
        console.error('Invalid ICE candidate data received:', data);
        return;
      }
    });

    setSocket(newSocket);

    return () => {
      console.log('Cleaning up socket connection');
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const startSearching = useCallback((preferences?: MatchPreferences) => {
    if (!socket || !isConnected) {
      setError(new Error('No socket connection available.'));
      return;
    }

    const defaultPreferences: MatchPreferences = {
      gender: 'both',
      region: 'global'
    };

    setError(null);
    setIsSearching(true);
    setCurrentMatch(null);

    console.log('Starting match search with preferences:', preferences || defaultPreferences);
    socket.emit('match:search', preferences || defaultPreferences);
  }, [socket, isConnected]);

  const stopSearching = useCallback(() => {
    if (!socket || !isConnected) {
      return;
    }

    console.log('Stopping match search');
    socket.emit('match:cancel');
    setIsSearching(false);
    setCurrentMatch(null);
  }, [socket, isConnected]);

  const skipCurrentMatch = useCallback(() => {
    if (!socket || !isConnected || !currentMatch) return;

    console.log('Skipping current match');
    socket.emit('match:skip', { matchId: currentMatch.id });
    setCurrentMatch(null);
    updateMatchStats(false);
  }, [socket, isConnected, currentMatch, updateMatchStats]);

  const reportUser = useCallback((reason: string) => {
    if (!socket || !isConnected || !currentMatch) return;

    console.log('Reporting user:', currentMatch.peerId, 'Reason:', reason);
    socket.emit('match:report', {
      matchId: currentMatch.id,
      peerId: currentMatch.peerId,
      reason
    });
    setCurrentMatch(null);
  }, [socket, isConnected, currentMatch]);

  const likeUser = useCallback(() => {
    if (!socket || !isConnected || !currentMatch) return;

    console.log('Liking user:', currentMatch.peerId);
    socket.emit('match:like', {
      matchId: currentMatch.id,
      peerId: currentMatch.peerId
    });
    setCurrentMatch(null);
  }, [socket, isConnected, currentMatch]);

  return (
    <SocketContext.Provider 
      value={{ 
        socket, 
        isConnected, 
        error,
        startSearching, 
        stopSearching,
        isSearching,
        skipCurrentMatch,
        reportUser,
        likeUser,
        matchStats,
        currentMatchId: currentMatch?.id || null,
        isPremium,
        setPremium: setIsPremium,
        blockUser,
        getBlockedUsers
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};