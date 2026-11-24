import { useEffect, useRef, useState } from 'react';

export function useCameraPreview(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsCameraReady(false);
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }

    let active = true;
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setIsCameraReady(true);
      } catch {
        if (active) {
          setCameraError('Não foi possível acessar a câmera frontal.');
          setIsCameraReady(false);
        }
      }
    };

    startCamera();

    return () => {
      active = false;
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled]);

  return { videoRef, isCameraReady, cameraError };
}
