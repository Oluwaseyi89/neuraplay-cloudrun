// Minimal Web Speech API types (not yet in TypeScript's DOM lib)

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
}

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

export interface RecognitionErrorEvent {
  error?: string;
}

export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: RecognitionResultEvent) => void) | null;
  onerror: ((ev: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

export const getRecognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

export const isRecognitionSupported = (): boolean => Boolean(getRecognitionCtor());

/** Stop a recognizer without firing its handlers */
export const detachAndStop = (rec: Recognition | null) => {
  if (!rec) return;
  rec.onresult = null;
  rec.onend = null;
  rec.onerror = null;
  try {
    rec.stop();
  } catch {
    // already stopped
  }
};
