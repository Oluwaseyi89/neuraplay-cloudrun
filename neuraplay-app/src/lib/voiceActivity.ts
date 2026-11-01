import { getRunningAudioContext } from "./audioContext";

export interface VoiceActivityOptions {
  /** Silence after speech that ends the recording */
  silenceMs: number;
  /** Give up if nobody starts talking within this long */
  noSpeechMs: number;
  /** Sustained speech needed before it counts (ignores clicks and bumps) */
  minSpeechMs?: number;
}

export type VoiceActivityEvent = "speech-ended" | "no-speech";

// Levels are RMS of samples in [-1, 1]
const MIN_SPEECH_LEVEL = 0.015;
const SPEECH_TO_NOISE_RATIO = 3;
// Cap the starting noise estimate in case recording begins mid-word
const MAX_INITIAL_NOISE_FLOOR = 0.02;
const FRAME_MS = 100;

/**
 * Speech/silence tracker fed with microphone levels. Learns the room's background
 * level while it's quiet and treats anything well above it as speech.
 */
export class VoiceActivityTracker {
  hasSpoken = false;
  private noiseFloor: number | null = null;
  private startedAt: number | null = null;
  private lastFrameAt: number | null = null;
  private lastSpeechAt: number | null = null;
  private speechMs = 0;
  private finished = false;
  private readonly minSpeechMs: number;

  constructor(private readonly options: VoiceActivityOptions) {
    this.minSpeechMs = options.minSpeechMs ?? 250;
  }

  feed(level: number, now: number): VoiceActivityEvent | null {
    if (this.finished) return null;
    if (this.startedAt === null) this.startedAt = now;
    const frameMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    if (this.noiseFloor === null) {
      this.noiseFloor = Math.min(level, MAX_INITIAL_NOISE_FLOOR);
    }

    const threshold = Math.max(this.noiseFloor * SPEECH_TO_NOISE_RATIO, MIN_SPEECH_LEVEL);
    if (level > threshold) {
      this.speechMs += frameMs;
      this.lastSpeechAt = now;
      if (this.speechMs >= this.minSpeechMs) this.hasSpoken = true;
    } else {
      // Only learn background noise from quiet frames
      this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;
    }

    if (this.hasSpoken && this.lastSpeechAt !== null && now - this.lastSpeechAt >= this.options.silenceMs) {
      this.finished = true;
      return "speech-ended";
    }
    if (!this.hasSpoken && now - this.startedAt >= this.options.noSpeechMs) {
      this.finished = true;
      return "no-speech";
    }
    return null;
  }
}

export const rootMeanSquare = (samples: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
};

export interface VoiceActivityMonitor {
  hasSpoken: () => boolean;
  stop: () => void;
}

/**
 * Watch a microphone stream and report when the speaker has finished (or never
 * started). Returns null if Web Audio isn't usable, e.g. the browser hasn't let
 * the page start audio yet; callers then fall back to manual stop.
 */
export const monitorVoiceActivity = async (
  stream: MediaStream,
  options: VoiceActivityOptions,
  onEvent: (event: VoiceActivityEvent) => void
): Promise<VoiceActivityMonitor | null> => {
  const context = await getRunningAudioContext();
  if (!context) return null;

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const tracker = new VoiceActivityTracker(options);
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    source.disconnect();
  };

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const event = tracker.feed(rootMeanSquare(samples), performance.now());
    if (event) {
      stop();
      onEvent(event);
    }
  }, FRAME_MS);

  return { hasSpoken: () => tracker.hasSpoken, stop };
};
