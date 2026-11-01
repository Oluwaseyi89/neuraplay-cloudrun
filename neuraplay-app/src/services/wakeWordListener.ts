import { getRecognitionCtor } from "../lib/speechRecognition";
import type { Recognition } from "../lib/speechRecognition";

type Matcher = (transcript: string) => boolean;

interface Subscriber {
  matches: Matcher;
  onWake: () => void;
}

// Chrome ends continuous sessions every few seconds (silence, internal limits), so
// restart almost immediately; back off only when sessions keep failing right away.
const RESTART_DELAY_MS = 250;
const MAX_RESTART_DELAY_MS = 3000;
const HEALTHY_SESSION_MS = 1000;

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
  private restartDelay = RESTART_DELAY_MS;
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

  private get shouldRun(): boolean {
    return this.subscribers.size > 0 && this.pausedBy.size === 0 && !this.blocked;
  }

  private sync() {
    if (this.shouldRun) {
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
    // Interim results let the wake phrase fire as soon as it is heard,
    // instead of after the speaker pauses
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    const startedAt = Date.now();

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const text = String(ev.results[i]?.[0]?.transcript || "").toLowerCase().trim();
        if (text && this.dispatch(text)) return;
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
      const healthy = Date.now() - startedAt >= HEALTHY_SESSION_MS;
      this.restartDelay = healthy
        ? RESTART_DELAY_MS
        : Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS);
      this.scheduleRestart();
    };

    try {
      rec.start();
      this.rec = rec;
    } catch (err) {
      // e.g. the previous session hasn't fully shut down yet; try again shortly
      console.warn("Wake listener failed to start, retrying:", err);
      this.restartDelay = Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS);
      this.scheduleRestart();
    }
  }

  /** Hand the phrase to the first matching subscriber. Returns true if one woke. */
  private dispatch(text: string): boolean {
    for (const [id, subscriber] of this.subscribers) {
      if (subscriber.matches(text)) {
        // Stop listening before waking so the same phrase can't fire twice;
        // the subscriber resumes the listener when it's done
        this.pause(id);
        subscriber.onWake();
        return true;
      }
    }
    return false;
  }

  private scheduleRestart() {
    if (!this.shouldRun || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.sync();
    }, this.restartDelay);
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

export { WakeWordListener };
export const wakeWordListener = new WakeWordListener();

let nextSubscriberId = 1;

/** Unique id for a component that subscribes to or pauses the listener */
export const createSubscriberId = (): number => nextSubscriberId++;
