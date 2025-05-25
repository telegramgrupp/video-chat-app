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
  iceCandidatePoolSize: 10
};

export const createPeerConnection = (
  userId: string,
  configuration: RTCConfiguration = ICE_SERVERS
): PeerConnection => {
  const connection = new RTCPeerConnection(configuration);
  
  connection.oniceconnectionstatechange = () => {
    console.warn(`ICE Connection State changed to: ${connection.iceConnectionState}`);
  };

  connection.onconnectionstatechange = () => {
    console.warn(`Connection State changed to: ${connection.connectionState}`);
  };

  connection.onsignalingstatechange = () => {
    console.warn(`Signaling State changed to: ${connection.signalingState}`);
  };

  return { userId, connection };
};

export const addTracksToConnection = (
  connection: RTCPeerConnection,
  stream: MediaStream
): void => {
  const senders = connection.getSenders();
  const tracks = stream.getTracks();

  tracks.forEach((track) => {
    const existingSender = senders.find(sender => sender.track?.kind === track.kind);
    if (existingSender) {
      existingSender.replaceTrack(track);
    } else {
      connection.addTrack(track, stream);
    }
  });
};

export const createOffer = async (
  connection: RTCPeerConnection
): Promise<RTCSessionDescriptionInit | null> => {
  try {
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      iceRestart: true
    });
    
    if (!offer || !offer.type) {
      throw new Error('Failed to create valid offer');
    }

    await connection.setLocalDescription(offer);
    return offer;
  } catch (err) {
    console.error('Error creating offer:', err);
    return null;
  }
};

export const createAnswer = async (
  connection: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> => {
  if (connection.signalingState !== 'have-remote-offer') {
    throw new Error(`Invalid signaling state for creating answer: ${connection.signalingState}`);
  }

  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  return answer;
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
  onDisconnected: () => void
): void => {
  connection.onconnectionstatechange = () => {
    const state = connection.connectionState;
    console.warn(`Connection state changed to: ${state}`);
    
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      onDisconnected();
    }
  };
};

export const handleTrackEvent = (
  connection: RTCPeerConnection,
  onTrack: (streams: readonly MediaStream[]) => void
): void => {
  connection.ontrack = (event) => {
    if (event.streams && event.streams.length > 0) {
      onTrack(event.streams);
    }
  };
};