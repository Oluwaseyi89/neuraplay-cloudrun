import { useCallback, useEffect, useRef, useState } from "react";

export type MicPermission = "granted" | "denied" | "prompt";

/** Owns the microphone stream: acquires it on mount, re-acquires on demand, releases on unmount */
export const useMicrophone = (constraints: MediaStreamConstraints) => {
  const [permission, setPermission] = useState<MicPermission>("prompt");
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  const acquire = useCallback(async (): Promise<MediaStream | null> => {
    try {
      console.log("Initializing microphone with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch((err) => {
        console.warn("Primary constraints failed, trying fallback:", err);
        return navigator.mediaDevices.getUserMedia({ audio: true });
      });
      setPermission("granted");
      return stream;
    } catch (err) {
      console.error("Microphone initialization failed:", err);
      setPermission("denied");
      return null;
    }
  }, [constraints]);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Drop the current stream and request a fresh one */
  const reinitialize = useCallback(async (): Promise<boolean> => {
    release();
    const stream = await acquire();
    streamRef.current = stream;
    setReady(Boolean(stream));
    return Boolean(stream);
  }, [acquire, release]);

  /** A live stream, re-acquiring it if the tracks have ended */
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    const live = streamRef.current?.getAudioTracks().some((track) => track.readyState === "live");
    if (live) return streamRef.current;
    return (await reinitialize()) ? streamRef.current : null;
  }, [reinitialize]);

  useEffect(() => {
    let cancelled = false;

    acquire().then((stream) => {
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setReady(Boolean(stream));
      setInitializing(false);
    });

    return () => {
      cancelled = true;
      release();
    };
  }, [acquire, release]);

  return { permission, ready, initializing, ensureStream, reinitialize };
};
