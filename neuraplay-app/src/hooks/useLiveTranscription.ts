import { useCallback, useEffect, useRef } from "react";
import { detachAndStop, getRecognitionCtor } from "../lib/speechRecognition";
import type { Recognition } from "../lib/speechRecognition";

// Chrome ends recognition sessions on its own every few seconds; resume after this delay
const RESTART_DELAY_MS = 300;

interface Options {
  /** Recognized text so far plus the current interim guess */
  onUpdate: (display: string) => void;
  /** Microphone access for speech recognition was refused */
  onBlocked: () => void;
}

/**
 * In-browser speech recognition used only for the live transcript while recording.
 * It never decides when recording ends: if the browser ends a session, it quietly
 * starts another and keeps the text recognized so far.
 */
export const useLiveTranscription = ({ onUpdate, onBlocked }: Options) => {
  const recRef = useRef<Recognition | null>(null);
  const active = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Final text from earlier sessions, and from the current one
  const earlierText = useRef("");
  const sessionText = useRef("");

  const handlersRef = useRef({ onUpdate, onBlocked });
  handlersRef.current = { onUpdate, onBlocked };

  const joined = (...parts: string[]) => parts.filter(Boolean).join(" ").trim();

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const startSession = useCallback((): boolean => {
    const RecognitionCtor = getRecognitionCtor();
    if (!RecognitionCtor) return false;

    sessionText.current = "";
    const rec = new RecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (ev) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const result = ev.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          final += (final ? " " : "") + text;
        } else {
          interim += text;
        }
      }
      sessionText.current = final.trim();
      handlersRef.current.onUpdate(joined(earlierText.current, sessionText.current, interim));
    };

    rec.onerror = (ev) => {
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        active.current = false;
        handlersRef.current.onBlocked();
      } else if (ev?.error !== "no-speech" && ev?.error !== "aborted") {
        console.warn("Live transcript error:", ev?.error);
      }
    };

    rec.onend = () => {
      recRef.current = null;
      earlierText.current = joined(earlierText.current, sessionText.current);
      sessionText.current = "";
      if (!active.current) return;
      restartTimer.current = setTimeout(() => {
        restartTimer.current = null;
        if (active.current) startSession();
      }, RESTART_DELAY_MS);
    };

    try {
      rec.start();
      recRef.current = rec;
      return true;
    } catch (err) {
      console.warn("Failed to start live transcript:", err);
      return false;
    }
  }, []);

  /** Returns false if recognition is unsupported or failed to start */
  const start = useCallback((): boolean => {
    clearRestart();
    earlierText.current = "";
    sessionText.current = "";
    active.current = true;
    const started = startSession();
    if (!started) active.current = false;
    return started;
  }, [startSession]);

  /** Stop listening and return everything recognized */
  const stop = useCallback((): string => {
    active.current = false;
    clearRestart();
    detachAndStop(recRef.current);
    recRef.current = null;
    const text = joined(earlierText.current, sessionText.current);
    earlierText.current = "";
    sessionText.current = "";
    return text;
  }, []);

  const clear = useCallback(() => {
    earlierText.current = "";
    sessionText.current = "";
  }, []);

  useEffect(() => () => {
    active.current = false;
    clearRestart();
    detachAndStop(recRef.current);
  }, []);

  return { start, stop, clear };
};
