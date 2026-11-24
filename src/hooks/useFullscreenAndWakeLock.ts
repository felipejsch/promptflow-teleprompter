import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export function useFullscreenAndWakeLock(keepAwake: boolean) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // iOS Safari may not support Fullscreen API; layout still occupies 100dvh
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        webkitFullscreenElement?: Element | null;
      };
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Keep screen awake while in prompter mode
  useEffect(() => {
    if (!keepAwake) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        if (nav.wakeLock && !cancelled) {
          wakeLockRef.current = await nav.wakeLock.request('screen');
        }
      } catch {
        // Wake Lock API unavailable or denied
      }
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && keepAwake) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [keepAwake]);

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
