import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeWordListener } from "./wakeWordListener";

/** Stand-in for the browser's SpeechRecognition that tests drive by hand */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failNextStart = false;

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  aborted = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (FakeRecognition.failNextStart) {
      FakeRecognition.failNextStart = false;
      throw new Error("InvalidStateError: recognition has already started");
    }
  }

  stop() {}

  abort() {
    this.aborted = true;
  }

  /** The browser ends the session (silence, internal limit, ...) */
  end(error?: string) {
    if (error) this.onerror?.({ error });
    this.onend?.();
  }

  hear(transcript: string, isFinal = false) {
    const result = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

const current = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];
const matchesFifa = (text: string) => text.includes("fifa");

describe("WakeWordListener", () => {
  let listener: WakeWordListener;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    FakeRecognition.failNextStart = false;
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    listener = new WakeWordListener();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restarts quickly after Chrome ends a normal session", () => {
    listener.subscribe(1, matchesFifa, vi.fn());
    vi.advanceTimersByTime(5000);
    current().end("no-speech");

    vi.advanceTimersByTime(300);

    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("stays fast across many normal sessions instead of backing off to long gaps", () => {
    listener.subscribe(1, matchesFifa, vi.fn());
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5000);
      current().end("aborted");
      vi.advanceTimersByTime(300);
    }

    expect(FakeRecognition.instances).toHaveLength(11);
  });

  it("backs off when sessions keep failing immediately, but never beyond 3 seconds", () => {
    listener.subscribe(1, matchesFifa, vi.fn());
    for (let i = 0; i < 8; i++) {
      current().end("network");
      vi.advanceTimersByTime(3000);
    }

    expect(FakeRecognition.instances).toHaveLength(9);
  });

  it("retries when start() throws instead of going silent", () => {
    FakeRecognition.failNextStart = true;
    listener.subscribe(1, matchesFifa, vi.fn());

    vi.advanceTimersByTime(1000);

    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("wakes on an interim result, once, and pauses itself", () => {
    const onWake = vi.fn();
    listener.subscribe(1, matchesFifa, onWake);
    const rec = current();

    rec.hear("hey fifa");
    rec.hear("hey fifa i keep");

    expect(onWake).toHaveBeenCalledTimes(1);
    expect(rec.aborted).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("wakes only the subscriber whose phrase matches", () => {
    const fifa = vi.fn();
    const lol = vi.fn();
    listener.subscribe(1, matchesFifa, fifa);
    listener.subscribe(2, (text) => text.includes("league"), lol);

    current().hear("hey league");

    expect(lol).toHaveBeenCalledTimes(1);
    expect(fifa).not.toHaveBeenCalled();
  });

  it("starts listening again when the woken subscriber resumes it", () => {
    listener.subscribe(1, matchesFifa, vi.fn());
    current().hear("fifa");

    listener.resume(1);

    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("stops for good when microphone access is denied", () => {
    listener.subscribe(1, matchesFifa, vi.fn());
    current().end("not-allowed");

    vi.advanceTimersByTime(10000);

    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
