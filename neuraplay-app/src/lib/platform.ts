import { isRecognitionSupported } from "./speechRecognition";

export type PlatformType = "mobile" | "tablet" | "desktop";
export type BrowserType = "chrome" | "firefox" | "safari" | "edge" | "other";

export const getPlatformType = (userAgent = navigator.userAgent): PlatformType => {
  const ua = userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const isTablet = /ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP)))/i.test(ua);

  if (isMobile) return "mobile";
  if (isTablet) return "tablet";
  return "desktop";
};

export const getBrowserType = (userAgent = navigator.userAgent): BrowserType => {
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) return "chrome";
  if (userAgent.includes("Firefox")) return "firefox";
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) return "safari";
  if (userAgent.includes("Edg")) return "edge";
  return "other";
};

export interface PlatformConfig {
  type: PlatformType;
  browser: BrowserType;
  info: string;
  isMobile: boolean;
  /** Mobile/tablet send recordings over HTTP; desktop streams over WebSocket with a wake word */
  useHttp: boolean;
  supportsTTS: boolean;
  supportsRecognition: boolean;
  audioConstraints: MediaStreamConstraints;
  recordingIntervalMs: number;
  /** Fallback when volume-based detection is unavailable: stop after this long without new transcript */
  silenceTimeoutMs: number;
  /** Pause after speech that ends a recording */
  speechEndSilenceMs: number;
  /** Cancel a recording if nobody starts talking within this long */
  noSpeechTimeoutMs: number;
  /** Hard cap on one recording */
  maxRecordingMs: number;
  wakeSimilarityThreshold: number;
}

const getAudioConstraints = (type: PlatformType, userAgent: string): MediaStreamConstraints => {
  if (type === "mobile") {
    if (/android.*chrome\/[.0-9]*/i.test(userAgent)) {
      return { audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } };
    }
    if (/iphone|ipad|ipod/i.test(userAgent)) {
      return { audio: { echoCancellation: true, noiseSuppression: true } };
    }
  }

  return {
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
};

export const detectPlatform = (userAgent = navigator.userAgent): PlatformConfig => {
  const type = getPlatformType(userAgent);
  const browser = getBrowserType(userAgent);
  const isMobile = type === "mobile";

  return {
    type,
    browser,
    info: `${type}-${browser}`,
    isMobile,
    useHttp: type !== "desktop",
    supportsTTS: "speechSynthesis" in window,
    supportsRecognition: isRecognitionSupported(),
    audioConstraints: getAudioConstraints(type, userAgent),
    recordingIntervalMs: isMobile ? 250 : 100,
    silenceTimeoutMs: isMobile ? 6000 : 4000,
    speechEndSilenceMs: 2000,
    noSpeechTimeoutMs: 8000,
    maxRecordingMs: 45000,
    wakeSimilarityThreshold: isMobile ? 0.55 : 0.65,
  };
};
