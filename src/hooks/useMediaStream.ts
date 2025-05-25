import { useEffect, useState } from 'react';

export interface MediaStreamOptions {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export interface UseMediaStreamReturn {
  stream: MediaStream | null;
  error: Error | null;
  isLoading: boolean;
  devices: MediaDeviceInfo[];
  errorReason: string | null;
}

export const useMediaStream = (options: MediaStreamOptions = { video: true, audio: true }): UseMediaStreamReturn => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const getMediaStream = async () => {
      try {
        // Önce cihaz listesini al, sadece bilgi için göster
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        if (mounted) setDevices(deviceList);
        // Asıl önemli olan getUserMedia'nın sonucu
        const mediaStream = await navigator.mediaDevices.getUserMedia(options);
        if (mounted) {
          setStream(mediaStream);
          setError(null);
          setErrorReason(null);
        }
      } catch (err: any) {
        if (mounted) {
          if (err.name === 'NotAllowedError') {
            setErrorReason('Kamera veya mikrofon izni verilmedi! Lütfen tarayıcı ayarlarından izin verin.');
            setError(new Error('Permission denied.'));
          } else if (err.name === 'NotFoundError') {
            setErrorReason('Kamera veya mikrofon bulunamadı. Lütfen cihazınızı kontrol edin.');
            setError(new Error('No camera or microphone found.'));
          } else if (err.name === 'NotReadableError') {
            setErrorReason('Kamera veya mikrofon başka bir uygulama tarafından kullanılıyor.');
            setError(new Error('Device in use.'));
          } else {
            setErrorReason('Kamera/mikrofon erişiminde bilinmeyen bir hata oluştu.');
            setError(err);
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    getMediaStream();
    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line
  }, []);

  return { stream, error, isLoading, devices, errorReason };
};