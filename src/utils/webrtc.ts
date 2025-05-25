import { PeerConnection } from '../types';

const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ]
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

export const createPeerConnection = (
  userId: string,
  configuration: RTCConfiguration = ICE_SERVERS
): PeerConnection => {
  const connection = new RTCPeerConnection(configuration);
  
  connection.oniceconnectionstatechange = () => {
    console.log(`ICE Connection State changed to: ${connection.iceConnectionState}`);
  };

  connection.onconnectionstatechange = () => {
    console.log(`Connection State changed to: ${connection.connectionState}`);
  };

  connection.onsignalingstatechange = () => {
    console.log(`Signaling State changed to: ${connection.signalingState}`);
  };

  connection.onicegatheringstatechange = () => {
    console.log(`ICE Gathering State changed to: ${connection.iceGatheringState}`);
  };

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('New ICE candidate:', event.candidate.candidate);
    }
  };

  return { userId, connection };
};

export const addTracksToConnection = (
  connection: RTCPeerConnection,
  stream: MediaStream
): void => {
  try {
    const senders = connection.getSenders();
    const tracks = stream.getTracks();

    tracks.forEach((track) => {
      const existingSender = senders.find(sender => sender.track?.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track).catch(err => {
          console.error('Error replacing track:', err);
          throw err;
        });
      } else {
        try {
          connection.addTrack(track, stream);
        } catch (err) {
          console.error('Error adding track:', err);
          throw err;
        }
      }
    });
  } catch (err) {
    console.error('Error in addTracksToConnection:', err);
    throw err;
  }
};

export const createOffer = async (
  connection: RTCPeerConnection
): Promise<RTCSessionDescriptionInit | null> => {
  try {
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      iceRestart: true,
      voiceActivityDetection: true
    });
    
    if (!offer || !offer.type) {
      throw new Error('Failed to create valid offer');
    }

    await connection.setLocalDescription(offer);
    return offer;
  } catch (err) {
    console.error('Error creating offer:', err);
    throw err;
  }
};

export const createAnswer = async (
  connection: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> => {
  try {
    if (connection.signalingState !== 'have-remote-offer') {
      throw new Error(`Invalid signaling state for creating answer: ${connection.signalingState}`);
    }

    const answer = await connection.createAnswer({
      voiceActivityDetection: true
    });
    
    await connection.setLocalDescription(answer);
    return answer;
  } catch (err) {
    console.error('Error creating answer:', err);
    throw err;
  }
};

export const addIceCandidate = async (
  connection: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> => {
  try {
    if (!connection.remoteDescription) {
      throw new Error('Cannot add ICE candidate without remote description');
    }
    await connection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
    throw err;
  }
};

export const handleConnectionStateChange = (
  connection: RTCPeerConnection,
  onDisconnected: () => void,
  onConnected: () => void,
  onFailed: () => void
): void => {
  connection.onconnectionstatechange = () => {
    const state = connection.connectionState;
    console.log(`Connection state changed to: ${state}`);
    
    switch (state) {
      case 'connected':
        onConnected();
        break;
      case 'disconnected':
        onDisconnected();
        break;
      case 'failed':
        onFailed();
        break;
    }
  };
};

export const restartIce = async (connection: RTCPeerConnection): Promise<void> => {
  try {
    if (connection.signalingState !== 'stable') {
      throw new Error('Cannot restart ICE in non-stable state');
    }
    
    const offer = await connection.createOffer({ iceRestart: true });
    await connection.setLocalDescription(offer);
  } catch (err) {
    console.error('Error restarting ICE:', err);
    throw err;
  }
};