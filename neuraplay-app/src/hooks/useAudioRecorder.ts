import { useCallback, useEffect, useRef } from "react";
import { getSupportedMimeType } from "../lib/audio";

interface Options {
  intervalMs: number;
  /** Called for each chunk in order; the next chunk waits for the previous promise */
  onChunk?: (chunk: Blob) => void | Promise<void>;
  /** Called after the last chunk has been handled */
  onStop?: (chunks: Blob[], mimeType: string, send: boolean) => void | Promise<void>;
}

/** MediaRecorder wrapper that delivers chunks in order and reports whether to send on stop */
export const useAudioRecorder = ({ intervalMs, onChunk, onStop }: Options) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkQueue = useRef<Promise<void>>(Promise.resolve());
  const sendOnStop = useRef(false);

  const handlersRef = useRef({ onChunk, onStop });
  handlersRef.current = { onChunk, onStop };

  const start = useCallback((stream: MediaStream): boolean => {
    try {
      chunksRef.current = [];
      chunkQueue.current = Promise.resolve();
      sendOnStop.current = false;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const chunk = event.data;
        chunksRef.current.push(chunk);
        chunkQueue.current = chunkQueue.current
          .then(() => handlersRef.current.onChunk?.(chunk))
          .catch((err) => console.warn("Failed to handle audio chunk:", err));
      };

      // The final chunk arrives just before stop, so wait for the queue to drain
      recorder.onstop = async () => {
        await chunkQueue.current;
        await handlersRef.current.onStop?.(chunksRef.current, recorder.mimeType || "audio/webm", sendOnStop.current);
      };

      recorder.start(intervalMs);
      recorderRef.current = recorder;
      console.log(`Started recording with ${intervalMs}ms interval`);
      return true;
    } catch (err) {
      console.error("Audio recording failed:", err);
      return false;
    }
  }, [intervalMs]);

  const stop = useCallback((send: boolean) => {
    sendOnStop.current = send;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
  }, []);

  return { start, stop };
};
