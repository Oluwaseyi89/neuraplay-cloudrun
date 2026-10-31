import { useCallback, useEffect, useRef } from "react";
import { detachAndStop, getRecognitionCtor } from "../lib/speechRecognition";
import type { Recognition } from "../lib/speechRecognition";

interface Options {
  /** Final text so far plus the current interim guess */
  onUpdate: (display: string) => void;
  onError: (error?: string) => void;
  /** The browser ended the session on its own */
  onEnd: () => void;
}

/** In-browser speech recognition used for the live transcript while recording */
export const useLiveTranscription = ({ onUpdate, onError, onEnd }: Options) => {
  const recRef = useRef<Recognition | null>(null);
  const finalText = useRef("");

  const handlersRef = useRef({ onUpdate, onError, onEnd });
  handlersRef.current = { onUpdate, onError, onEnd };

  /** Returns false if recognition is unsupported or failed to start */
  const start = useCallback((): boolean => {
    const RecognitionCtor = getRecognitionCtor();
    if (!RecognitionCtor) return false;

    finalText.current = "";
    const rec = new RecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          finalText.current += (finalText.current ? " " : "") + text;
        } else {
          interim += text;
        }
      }
      handlersRef.current.onUpdate((finalText.current + (interim ? " " + interim : "")).trim());
    };
    rec.onerror = (ev) => handlersRef.current.onError(ev?.error);
    rec.onend = () => handlersRef.current.onEnd();

    try {
      rec.start();
      recRef.current = rec;
      return true;
    } catch (err) {
      console.error("Failed to start recognition:", err);
      return false;
    }
  }, []);

  /** Stop listening and return the final recognized text */
  const stop = useCallback((): string => {
    detachAndStop(recRef.current);
    recRef.current = null;
    const text = finalText.current.trim();
    finalText.current = "";
    return text;
  }, []);

  const clear = useCallback(() => {
    finalText.current = "";
  }, []);

  useEffect(() => () => detachAndStop(recRef.current), []);

  return { start, stop, clear };
};
