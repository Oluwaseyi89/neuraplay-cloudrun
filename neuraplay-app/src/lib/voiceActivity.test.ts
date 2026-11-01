import { describe, expect, it } from "vitest";
import { VoiceActivityTracker, rootMeanSquare } from "./voiceActivity";
import type { VoiceActivityEvent } from "./voiceActivity";

const QUIET = 0.004;
const SPEECH = 0.08;
const FRAME_MS = 100;
const OPTIONS = { silenceMs: 2000, noSpeechMs: 8000 };

/** Feed a sequence of [level, durationMs] segments; return the first event and when it fired */
const run = (tracker: VoiceActivityTracker, segments: Array<[number, number]>) => {
  let now = 0;
  for (const [level, durationMs] of segments) {
    for (let elapsed = 0; elapsed < durationMs; elapsed += FRAME_MS) {
      const event: VoiceActivityEvent | null = tracker.feed(level, now);
      if (event) return { event, at: now };
      now += FRAME_MS;
    }
  }
  return { event: null, at: now };
};

describe("VoiceActivityTracker", () => {
  it("ends after speech followed by the silence window", () => {
    const result = run(new VoiceActivityTracker(OPTIONS), [[QUIET, 500], [SPEECH, 3000], [QUIET, 5000]]);

    // Last speech frame is at 3400ms (frames are 100ms apart, starting at 500ms)
    const lastSpeechFrame = 500 + 3000 - FRAME_MS;
    expect(result.event).toBe("speech-ended");
    expect(result.at).toBeGreaterThanOrEqual(lastSpeechFrame + 2000);
    expect(result.at).toBeLessThan(lastSpeechFrame + 2300);
  });

  it("keeps recording through short pauses between sentences", () => {
    const tracker = new VoiceActivityTracker(OPTIONS);
    const result = run(tracker, [[QUIET, 500], [SPEECH, 2000], [QUIET, 1200], [SPEECH, 2000], [QUIET, 1200], [SPEECH, 1000]]);

    expect(result.event).toBeNull();
    expect(tracker.hasSpoken).toBe(true);
  });

  it("reports no speech when nobody talks", () => {
    const result = run(new VoiceActivityTracker(OPTIONS), [[QUIET, 10000]]);

    expect(result.event).toBe("no-speech");
    expect(result.at).toBe(8000);
  });

  it("ignores a brief click or bump", () => {
    const tracker = new VoiceActivityTracker(OPTIONS);
    const result = run(tracker, [[QUIET, 1000], [SPEECH, 100], [QUIET, 9000]]);

    expect(tracker.hasSpoken).toBe(false);
    expect(result.event).toBe("no-speech");
  });

  it("adapts to a noisy room instead of treating the noise as speech", () => {
    const fan = 0.02;
    const tracker = new VoiceActivityTracker(OPTIONS);
    const result = run(tracker, [[fan, 3000], [0.12, 2000], [fan, 4000]]);

    expect(result.event).toBe("speech-ended");
  });

  it("detects speech even when recording starts mid-word", () => {
    const result = run(new VoiceActivityTracker(OPTIONS), [[SPEECH, 2000], [QUIET, 3000]]);

    expect(result.event).toBe("speech-ended");
  });
});

describe("rootMeanSquare", () => {
  it("measures signal level", () => {
    expect(rootMeanSquare(new Float32Array([0, 0, 0, 0]))).toBe(0);
    expect(rootMeanSquare(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
