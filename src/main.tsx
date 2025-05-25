import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VideoProvider } from './contexts/VideoContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SocketProvider>
        <VideoProvider>
          <App />
        </VideoProvider>
      </SocketProvider>
    </AuthProvider>
  </StrictMode>
);