type AudioContextCtor = new () => AudioContext;

// One shared context: browsers limit how many a page may create
let context: AudioContext | null = null;

const RESUME_TIMEOUT_MS = 500;

const getAudioContext = (): AudioContext | null => {
  if (context) return context;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
};

/** Call from a user gesture so later voice detection can run without one */
export const resumeAudioContext = () => {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
};

/** The shared context once it's running, or null if the browser won't start it yet */
export const getRunningAudioContext = async (): Promise<AudioContext | null> => {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    await Promise.race([
      ctx.resume().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
    ]);
  }
  return ctx.state === "running" ? ctx : null;
};
