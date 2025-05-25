import { supabase } from './supabase';

interface RecordingOptions {
  localStream: MediaStream;
  remoteStream: MediaStream;
  type: 'fake' | 'real';
}

class RecordingManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private type: 'fake' | 'real' = 'real';

  async startRecording({ localStream, remoteStream, type }: RecordingOptions) {
    try {
      // Create a canvas to combine both streams
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      // Create video elements for both streams
      const localVideo = document.createElement('video');
      const remoteVideo = document.createElement('video');
      localVideo.srcObject = localStream;
      remoteVideo.srcObject = remoteStream;
      localVideo.muted = true;
      remoteVideo.muted = true;
      await Promise.all([
        localVideo.play(),
        remoteVideo.play()
      ]);

      // Create a combined stream from the canvas
      const canvasStream = canvas.captureStream(30);
      const audioTracks = [
        ...localStream.getAudioTracks(),
        ...remoteStream.getAudioTracks()
      ];
      audioTracks.forEach(track => canvasStream.addTrack(track));

      // Draw both videos side by side
      const drawFrame = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw local video on the left
        ctx.drawImage(localVideo, 0, 0, canvas.width / 2, canvas.height);
        // Draw remote video on the right
        ctx.drawImage(remoteVideo, canvas.width / 2, 0, canvas.width / 2, canvas.height);
        
        if (this.mediaRecorder?.state === 'recording') {
          requestAnimationFrame(drawFrame);
        }
      };

      // Start recording
      this.type = type;
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 3000000 // 3 Mbps
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Capture in 1-second chunks
      drawFrame();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  async stopRecording() {
    if (!this.mediaRecorder) return;

    return new Promise<void>((resolve, reject) => {
      this.mediaRecorder!.onstop = async () => {
        try {
          await this.uploadRecording();
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      this.mediaRecorder!.stop();
    });
  }

  private async uploadRecording() {
    if (this.recordedChunks.length === 0) return;

    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const fileName = `${this.type}/${Date.now()}-${crypto.randomUUID()}.webm`;
    const { error } = await supabase.storage
      .from('recordings')
      .upload(fileName, blob, {
        contentType: 'video/webm',
        cacheControl: '3600'
      });

    if (error) {
      console.error('Failed to upload recording:', error);
      throw error;
    }
  }
}

export const recordingManager = new RecordingManager();