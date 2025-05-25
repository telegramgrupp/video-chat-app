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

// --- PROFESSIONAL MATCHMAKING SYSTEM ---

interface Peer {
  id: string;
  socket: any;
  preferences: any;
  blocked: Set<string>;
  isPremium?: boolean;
}

export const initializeSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
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

  // Debug için bağlantı olaylarını dinle
  io.engine.on('connection_error', (err) => {
    console.error('Connection error:', err);
  });

  io.engine.on('upgrade_error', (err) => {
    console.error('Upgrade error:', err);
  });

  const waitingPeers: Peer[] = [];
  const matches = new Map<string, Match>();
  const blocklists = new Map<string, Set<string>>();

  function findMatchFor(peer: Peer): Peer | null {
    // Eşleşme kriterleri: Engellenmemiş, kendisi değil, aktif match yok, tercihler uyuyor
    return waitingPeers.find(other =>
      other.id !== peer.id &&
      !matches.has(other.id) &&
      !peer.blocked.has(other.id) &&
      !(blocklists.get(other.id)?.has(peer.id))
      // Burada tercihlere göre filtre eklenebilir (örn. cinsiyet, ülke, premium)
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
        // Karşı tarafı tekrar kuyruğa al
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

    // Kullanıcı engelleme (future-proof)
    socket.on('block:user', (userId: string) => {
      if (!blocklists.has(socket.id)) blocklists.set(socket.id, new Set());
      blocklists.get(socket.id)!.add(userId);
      console.log(`${socket.id} blocked ${userId}`);
    });

    // Eşleşme arama
    socket.on('match:search', (preferences) => {
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      const peer: Peer = {
        id: socket.id,
        socket,
        preferences,
        blocked: blocklists.get(socket.id) || new Set()
      };
      // Kuyruğa ekle
      waitingPeers.push(peer);
      emitQueueCount();
      // Eşleşme ara
      const matchPeer = findMatchFor(peer);
      if (matchPeer) {
        // Kuyruktan çıkar
        removeFromQueue(peer.id);
        removeFromQueue(matchPeer.id);
        emitQueueCount();
        // Match oluştur
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
        // Her iki peer'a da match verisi gönder
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
        // Eşleşme yok, beklemeye devam
        console.log('No match found, waiting:', peer.id);
      }
    });

    // Eşleşme iptali
    socket.on('match:cancel', () => {
      console.log('⏹️ Match cancelled by:', socket.id);
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      emitQueueCount();
    });

    // Bağlantı koparsa
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
      cleanupMatch(socket.id);
      removeFromQueue(socket.id);
      emitQueueCount();
    });

    // WebRTC sinyalleşme
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

    // Next/Skip (karşıdakini geç)
    socket.on('match:skip', () => {
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        // Her iki tarafın match'ini sil
        matches.delete(socket.id);
        matches.delete(otherPeerId);
        // Karşı tarafa bildirim gönder
        io.to(otherPeerId).emit('match:skipped');
        // Her iki tarafı tekrar kuyruğa al
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

    // Report/Block (şikayet/engelle)
    socket.on('match:report', (reportedUserId: string) => {
      if (!blocklists.has(socket.id)) blocklists.set(socket.id, new Set());
      blocklists.get(socket.id)!.add(reportedUserId);
      // Karşı tarafın match'ini sil
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        matches.delete(socket.id);
        matches.delete(otherPeerId);
        io.to(otherPeerId).emit('match:reported');
      }
      // Sadece raporlayan tekrar kuyruğa alınır
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

    // Like gönderme
    socket.on('match:like', () => {
      const match = matches.get(socket.id);
      if (match) {
        const otherPeerId = match.peerA === socket.id ? match.peerB : match.peerA;
        io.to(otherPeerId).emit('match:like');
      }
    });

    // Emoji gönderme
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