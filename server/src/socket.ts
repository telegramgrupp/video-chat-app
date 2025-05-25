import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

interface Match {
  id: string;
  peerA: string;
  peerB: string;
  startTime: number;
  quality: number;
}

interface MatchData {
  peerId: string;
  matchId: string;
  quality: number;
  startTime: number;
}

interface Peer {
  id: string;
  socket: any;
  preferences: any;
  blocked: Set<string>;
  isPremium?: boolean;
}

export const initializeSocket = (httpServer: HttpServer, corsOptions: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      methods: corsOptions.methods,
      credentials: corsOptions.credentials,
      allowedHeaders: corsOptions.allowedHeaders
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000,
    upgradeTimeout: 30000,
    cookie: {
      name: 'io',
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    }
  });

  const waitingPeers: Peer[] = [];
  const matches = new Map<string, Match>();
  const blocklists = new Map<string, Set<string>>();

  function findMatchFor(peer: Peer): Peer | null {
    return waitingPeers.find(other =>
      other.id !== peer.id &&
      !matches.has(other.id) &&
      !peer.blocked.has(other.id) &&
      !(blocklists.get(other.id)?.has(peer.id))
    ) || null;
  }

  function removeFromQueue(peerId: string) {
    const idx = waitingPeers.findIndex(p => p.id === peerId);
    if (idx !== -1) waitingPeers.splice(idx, 1);
  }

  function cleanupMatch(peerId: string) {
    const match = matches.get(peerId);
    if (match) {
      const otherPeerId = match.peerA === peerId ? match.peerB : match.peerA;
      if (otherPeerId) {
        matches.delete(otherPeerId);
        io.to(otherPeerId).emit('match:cancelled');
        const otherPeer = waitingPeers.find(p => p.id === otherPeerId);
        if (!otherPeer) {
          const sock = io.sockets.sockets.get(otherPeerId);
          if (sock) {
            waitingPeers.push({
              id: otherPeerId,
              socket: sock,
              preferences: {},
              blocked: blocklists.get(otherPeerId) || new Set()
            });
          }
        }
      }
      matches.delete(peerId);
    }
    removeFromQueue(peerId);
  }

  function emitQueueCount() {
    io.emit('queue:count', waitingPeers.length);
  }

  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('block:user', (userId: string) => {
      if (!blocklists.has(socket.id)) blocklists.set(socket.id, new Set());
      blocklists.get(socket.id)!.add(userId);
      console.log(`${socket.id} blocked ${userId}`);
    });

    socket.on('match:search', (preferences) => {
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      const peer: Peer = {
        id: socket.id,
        socket,
        preferences,
        blocked: blocklists.get(socket.id) || new Set()
      };
      waitingPeers.push(peer);
      emitQueueCount();

      const matchPeer = findMatchFor(peer);
      if (matchPeer) {
        removeFromQueue(peer.id);
        removeFromQueue(matchPeer.id);
        emitQueueCount();

        const matchId = `match_${Date.now()}_${peer.id}_${matchPeer.id}`;
        const startTime = Date.now();
        const quality = 1;
        const match: Match = {
          id: matchId,
          peerA: peer.id,
          peerB: matchPeer.id,
          startTime,
          quality
        };
        matches.set(peer.id, match);
        matches.set(matchPeer.id, match);

        const matchDataA: MatchData = {
          peerId: matchPeer.id,
          matchId,
          quality,
          startTime
        };
        const matchDataB: MatchData = {
          peerId: peer.id,
          matchId,
          quality,
          startTime
        };
        peer.socket.emit('match:found', matchDataA);
        matchPeer.socket.emit('match:found', matchDataB);
        console.log('Match started:', matchDataA, matchDataB);
      } else {
        console.log('No match found, waiting:', peer.id);
      }
    });

    socket.on('match:cancel', () => {
      console.log('⏹️ Match cancelled by:', socket.id);
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      emitQueueCount();
    });

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      emitQueueCount();
    });

    socket.on('webrtc:offer', (data) => {
      if (!data.offer || !data.to) return;
      io.to(data.to).emit('webrtc:offer', { offer: data.offer, from: socket.id });
    });

    socket.on('webrtc:answer', (data) => {
      if (!data.answer || !data.to) return;
      io.to(data.to).emit('webrtc:answer', { answer: data.answer, from: socket.id });
    });

    socket.on('webrtc:ice-candidate', (data) => {
      if (!data.candidate || !data.to) return;
      io.to(data.to).emit('webrtc:ice-candidate', { candidate: data.candidate, from: socket.id });
    });

    socket.on('match:skip', () => {
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        matches.delete(socket.id);
        matches.delete(otherPeerId);
        io.to(otherPeerId).emit('match:skipped');
        [socket.id, otherPeerId].forEach(id => {
          const sock = io.sockets.sockets.get(id);
          if (sock) {
            waitingPeers.push({
              id,
              socket: sock,
              preferences: {},
              blocked: blocklists.get(id) || new Set()
            });
          }
        });
        emitQueueCount();
      }
    });

    socket.on('match:report', (reportedUserId: string) => {
      if (!blocklists.has(socket.id)) blocklists.set(socket.id, new Set());
      blocklists.get(socket.id)!.add(reportedUserId);
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        matches.delete(socket.id);
        matches.delete(otherPeerId);
        io.to(otherPeerId).emit('match:reported');
      }
      const sock = io.sockets.sockets.get(socket.id);
      if (sock) {
        waitingPeers.push({
          id: socket.id,
          socket: sock,
          preferences: {},
          blocked: blocklists.get(socket.id) || new Set()
        });
      }
      emitQueueCount();
    });

    socket.on('match:like', () => {
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        io.to(otherPeerId).emit('match:like');
      }
    });

    socket.on('match:emoji', (emoji) => {
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        io.to(otherPeerId).emit('match:emoji', emoji);
      }
    });
  });

  return io;
};