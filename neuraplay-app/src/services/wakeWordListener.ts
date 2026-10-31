import { getRecognitionCtor } from "../lib/speechRecognition";
import type { Recognition } from "../lib/speechRecognition";

type Matcher = (transcript: string) => boolean;

interface Subscriber {
  matches: Matcher;
  onWake: () => void;
}

/**
 * Browsers allow only one active SpeechRecognition session per page, so every
 * VoiceInput shares this single wake-word listener instead of running its own.
 * Each subscriber checks the heard phrase; the first match gets the wake event.
 */
class WakeWordListener {
  private subscribers = new Map<number, Subscriber>();
  private pausedBy = new Set<number>();
  private rec: Recognition | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 500;
  private blocked = false;

  get isSupported(): boolean {
    return Boolean(getRecognitionCtor());
  }

  subscribe(id: number, matches: Matcher, onWake: () => void) {
    this.subscribers.set(id, { matches, onWake });
    this.blocked = false;
    this.sync();
  }

  unsubscribe(id: number) {
    this.subscribers.delete(id);
    this.pausedBy.delete(id);
    this.sync();
  }

  /** Stop listening while a panel records or plays a response */
  pause(id: number) {
    this.pausedBy.add(id);
    this.sync();
  }

  resume(id: number) {
    this.pausedBy.delete(id);
    this.sync();
  }

  private sync() {
    const shouldRun = this.subscribers.size > 0 && this.pausedBy.size === 0 && !this.blocked;
    if (shouldRun) {
      this.start();
    } else {
      this.stop();
    }
  }

  private start() {
    if (this.rec || this.restartTimer) return;
    const Recognition = getRecognitionCtor();
    if (!Recognition) return;

    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      this.backoff = 500;
      const last = ev.results[ev.results.length - 1];
      const text = String(last?.[0]?.transcript || "").toLowerCase().trim();
      if (!text) return;

      for (const subscriber of this.subscribers.values()) {
        if (subscriber.matches(text)) {
          subscriber.onWake();
          return;
        }
      }
    };

    rec.onerror = (ev) => {
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        console.warn("Wake listener: microphone access not allowed");
        this.blocked = true;
      } else if (ev?.error !== "no-speech" && ev?.error !== "aborted") {
        console.warn("Wake listener error:", ev?.error);
      }
    };

    rec.onend = () => {
      this.rec = null;
      if (this.blocked || this.subscribers.size === 0 || this.pausedBy.size > 0) return;

      // Browsers end continuous sessions periodically; restart with backoff
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 8000);
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.sync();
      }, delay);
    };

    try {
      rec.start();
      this.rec = rec;
    } catch (err) {
      console.warn("Wake listener failed to start:", err);
    }
  }

  private stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.rec) return;

    const rec = this.rec;
    this.rec = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // already stopped
    }
  }
}

export const wakeWordListener = new WakeWordListener();

let nextSubscriberId = 1;

/** Unique id for a component that subscribes to or pauses the listener */
export const createSubscriberId = (): number => nextSubscriberId++;
