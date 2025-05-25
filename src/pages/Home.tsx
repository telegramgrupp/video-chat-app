import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Smile, Globe2 } from 'lucide-react';
import { useMediaStream } from '../hooks/useMediaStream';
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import { useSocket } from '../contexts/SocketContext';
import { Layout } from '../components/layout/Layout';
import { Gender, Region } from '../types';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user, preferences, setPreferences } = useAuth();
  const { isConnected, socket } = useSocket();
  const [videoError, setVideoError] = React.useState<string | null>(null);
  const [gender, setGender] = React.useState<Gender>(preferences.gender);
  const [region, setRegion] = React.useState<Region>(preferences.region);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [showLikeAnim, setShowLikeAnim] = useState(false);
  const [showEmojiAnim, setShowEmojiAnim] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string | undefined>(undefined);
  const [selectedMicrophone, setSelectedMicrophone] = useState<string | undefined>(undefined);
  
  const { 
    remoteVideoRef,
    remoteStream,
    isChatting,
    isSearching,
    startChat,
    endChat,
    error: chatError,
    connectionStatus
  } = useVideo();

  const { stream: localStream, error: mediaError, devices, errorReason } = useMediaStream({
    video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
    audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true,
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Fun tips for waiting
  const tips = [
    'Yeni insanlarla tanışmak için harika bir gün!',
    'Unutma: Gülümsemek bulaşıcıdır 😄',
    'Kendin ol, eğlen!',
    'Saygılı ol, eğlence iki kişiliktir!',
    'Hoş sohbetler, yeni arkadaşlıklar!',
    'Bir selam, bir gülümseme her şeyi değiştirebilir!'
  ];
  const [tip, setTip] = useState(tips[Math.floor(Math.random() * tips.length)]);
  useEffect(() => {
    if (!isChatting) {
      setTip(tips[Math.floor(Math.random() * tips.length)]);
    }
  }, [isChatting]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      try {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(err => {
          setVideoError(`Failed to play local video: ${err.message}`);
        });
      } catch (err) {
        setVideoError(`Failed to set local video source: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }, [localStream]);

  const handleStartChat = () => {
    setPreferences({ gender, region });
    startChat();
  };

  const handleLikeUser = () => {
    if (socket && isChatting) {
      socket.emit('match:like');
    }
    // TODO: Show like animation locally
    console.log('Like sent!');
  };

  const handleSendEmoji = () => {
    if (socket && isChatting) {
      socket.emit('match:emoji', '😊'); // örnek emoji
    }
    // TODO: Show emoji animation locally
    console.log('Emoji sent!');
  };

  const handleSkipUser = () => {
    if (socket && remoteStream) {
      socket.emit('match:skip');
    }
    endChat();
    startChat();
  };

  const handleReportUser = () => {
    if (socket && remoteStream) {
      // remoteStream id yok, peerId'yi VideoContext'ten almak daha doğru olurdu
      // Şimdilik remoteStream varsa skip gibi davran
      socket.emit('match:report', /* karşı tarafın id'si burada olmalı */);
    }
    endChat();
    // Optionally block user locally
  };

  // Sunucudan gelen bildirimleri dinle
  useEffect(() => {
    if (!socket) return;
    const onSkipped = () => {
      setStatusMessage('Karşı taraf sizi geçti. Yeni eşleşme aranıyor...');
      endChat();
      startChat();
    };
    const onReported = () => {
      setStatusMessage('Karşı taraf sizi şikayet etti. Yeni eşleşme aranıyor...');
      endChat();
      startChat();
    };
    const onLike = () => {
      setShowLikeAnim(true);
      setStatusMessage('Karşı taraf sizi beğendi!');
      setTimeout(() => setShowLikeAnim(false), 1500);
    };
    const onEmoji = (emoji: string) => {
      setShowEmojiAnim(emoji);
      setStatusMessage(`Karşı taraf emoji gönderdi: ${emoji}`);
      setTimeout(() => setShowEmojiAnim(null), 1500);
    };
    socket.on('match:skipped', onSkipped);
    socket.on('match:reported', onReported);
    socket.on('match:like', onLike);
    socket.on('match:emoji', onEmoji);
    return () => {
      socket.off('match:skipped', onSkipped);
      socket.off('match:reported', onReported);
      socket.off('match:like', onLike);
      socket.off('match:emoji', onEmoji);
    };
  }, [socket]);

  // Status mesajını otomatik gizle
  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 2500);
      return () => clearTimeout(t);
    }
  }, [statusMessage]);

  // Sunucudan bekleyen kullanıcı sayısını dinle
  useEffect(() => {
    if (!socket) return;
    const onQueueCount = (count: number) => setQueueCount(count);
    socket.on('queue:count', onQueueCount);
    return () => { socket.off('queue:count', onQueueCount); };
  }, [socket]);

  return (
    <Layout requireAuth>
      <div className="flex h-screen w-full bg-[#0f172a] transition-colors duration-700">
        {/* Status Message */}
        {statusMessage && (
          <div className="fixed left-1/2 top-8 z-50 -translate-x-1/2 rounded-lg bg-black/80 px-6 py-3 text-lg text-white shadow-lg animate-fade-in transition-opacity duration-500">
            {statusMessage}
          </div>
        )}
        {/* Video Grid */}
        <div className="flex w-1/2 items-center justify-center transition-all duration-700">
          <div className="relative h-full w-full">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full rounded-lg object-cover ${!localStream ? 'hidden' : ''} transition-all duration-700 ${isChatting ? 'shadow-2xl ring-4 ring-indigo-400/60' : 'ring-2 ring-indigo-200/40'}`}
            />
            <div className="absolute right-4 top-4 rounded-lg bg-black/50 px-4 py-2 text-sm text-white transition-all duration-500">    
                Status: {connectionStatus}
            </div>
            {(mediaError || videoError) && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 animate-fade-in">
                <div className="p-4 text-center text-xl text-red-500">
                  {mediaError?.message || videoError}
                </div>
              </div>
            )}
            <div className="absolute left-4 top-4 rounded-lg bg-black/50 px-4 py-2 text-white transition-all duration-500">
              <p className="text-sm">You</p>
            </div>
          </div>
        </div>

        <div className="flex w-1/2 items-center justify-center transition-all duration-700">
          <div className="relative h-full w-full">
            <video
              id="remoteVideo"
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full rounded-lg object-cover transition-all duration-700"
              style={{ display: isChatting && remoteStream ? 'block' : 'none' }}
            />
            {!isChatting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
                <div className="w-full max-w-md space-y-8 p-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">I want to meet</label>
                      <div className="flex rounded-lg bg-white/10 p-1">
                        {(['male', 'female', 'both'] as const).map((option) => (
                          <button
                            key={option}
                            onClick={() => setGender(option)}
                            className={`flex-1 rounded-md py-2 text-sm font-medium capitalize transition-all ${
                              gender === option
                                ? 'bg-indigo-600 text-white'
                                : 'text-gray-300 hover:text-white'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">Region</label>
                      <div className="flex rounded-lg bg-white/10 p-1">
                        {(['TR', 'US', 'global'] as const).map((option) => (
                          <button
                            key={option}
                            onClick={() => setRegion(option)}
                            className={`flex-1 rounded-md py-2 text-sm font-medium uppercase transition-all ${
                              region === option
                                ? 'bg-indigo-600 text-white'
                                : 'text-gray-300 hover:text-white'
                            }`}
                          >
                            {option === 'global' ? <Globe2 className="mx-auto h-5 w-5" /> : option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-col items-center justify-center space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400"></span>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: '0.2s' }}></span>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: '0.4s' }}></span>
                    </div>
                    <span className="text-sm text-indigo-300 animate-fade-in">Şu an bekleyen <b>{queueCount}</b> kişi var</span>
                  </div>

                  <div className="mt-2 flex items-center justify-center">
                    <span className="rounded-lg bg-indigo-900/60 px-4 py-2 text-indigo-100 shadow-md animate-fade-in transition-all duration-700">
                      {tip}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-2">
                    {errorReason && (
                      <span className="text-sm text-red-400">{errorReason}</span>
                    )}
                  </div>

                  <button
                    onClick={isSearching ? endChat : handleStartChat}
                    disabled={!isConnected || !!mediaError}
                    className={`w-full rounded-lg py-3 text-lg font-semibold text-white transition-all ${
                      !isConnected || mediaError
                        ? 'cursor-not-allowed bg-gray-500'
                        : isSearching
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {!isConnected ? 'Connecting...' : isSearching ? 'Cancel Search' : 'Start Chatting'}
                  </button>

                  {chatError && (
                    <p className="mt-4 text-center text-red-400">{chatError.message}</p>
                  )}
                </div>
              </div>
            )}
            {isChatting && remoteStream && (
              <>
                {/* Animasyonlar */}
                {showLikeAnim && (
                  <div className="pointer-events-none absolute left-1/2 top-1/3 z-50 -translate-x-1/2 animate-fade-in-up">
                    <Heart className="h-16 w-16 text-pink-400 drop-shadow-lg animate-pulse" />
                  </div>
                )}
                {showEmojiAnim && (
                  <div className="pointer-events-none absolute left-1/2 top-1/3 z-50 -translate-x-1/2 animate-fade-in-up text-6xl">
                    {showEmojiAnim}
                  </div>
                )}
                <div className="absolute bottom-4 right-4 flex space-x-2">
                  <button
                    className="rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20"
                    title="Like"
                    onClick={handleLikeUser}
                  >
                    <Heart className="h-5 w-5" />
                  </button>
                  <button
                    className="rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20"
                    title="Send Emoji"
                    onClick={handleSendEmoji}
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                  <button
                    className="rounded-full bg-blue-500/20 p-2 text-blue-400 backdrop-blur-sm hover:bg-blue-500/40"
                    title="Next (Skip)"
                    onClick={handleSkipUser}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    className="rounded-full bg-red-500/20 p-2 text-red-400 backdrop-blur-sm hover:bg-red-500/40"
                    title="Report / Block"
                    onClick={handleReportUser}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm9-3.75a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};