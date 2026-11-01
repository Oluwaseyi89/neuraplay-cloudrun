import { useCallback, useEffect, useRef } from "react";
import { SILENT_WAV, toAudioDataUri } from "../lib/audio";
import { resumeAudioContext } from "../lib/audioContext";
import type { VoiceResult } from "../types/analysis";

/** Plays spoken responses: server audio first, the browser's own voice as fallback */
export const useAudioPlayback = (supportsTTS: boolean) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlocked = useRef(false);

  const getAudioElement = (): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  };

  /** Must run inside a user gesture; afterwards the same element may play without one */
  const unlock = useCallback(() => {
    // Also start Web Audio, which voice activity detection needs
    resumeAudioContext();
    if (unlocked.current) return;
    const el = getAudioElement();
    el.src = SILENT_WAV;
    el.play()
      .then(() => {
        el.pause();
        unlocked.current = true;
      })
      .catch(() => {});

    if (supportsTTS) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  }, [supportsTTS]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (supportsTTS) window.speechSynthesis.cancel();
  }, [supportsTTS]);

  const playBase64Audio = (base64Data: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const el = getAudioElement();
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("Audio playback failed"));
      el.src = toAudioDataUri(base64Data);
      el.play().catch(reject);
    });

  const speakText = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      if (!supportsTTS) {
        reject(new Error("Speech synthesis not supported"));
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      const timeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        reject(new Error("TTS timeout"));
      }, Math.max(10000, text.length * 120));

      utterance.onend = () => {
        clearTimeout(timeout);
        resolve();
      };
      utterance.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("TTS failed"));
      };

      window.speechSynthesis.speak(utterance);
    });

  const speak = async (result: VoiceResult, onStatus: (status: string) => void) => {
    if (result.tts_audio) {
      onStatus("Playing response...");
      try {
        await playBase64Audio(result.tts_audio);
        return;
      } catch (err) {
        console.warn("Server audio playback failed, using browser voice:", err);
      }
    }

    const text = result.analysis?.summary;
    if (text && supportsTTS) {
      onStatus("Speaking response...");
      try {
        await speakText(text);
      } catch (err) {
        console.warn("Browser voice failed:", err);
      }
    }
  };

  // Any first interaction unlocks audio so wake-word responses can play aloud
  useEffect(() => {
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      stop();
    };
  }, [unlock, stop]);

  return { unlock, stop, speak };
};
