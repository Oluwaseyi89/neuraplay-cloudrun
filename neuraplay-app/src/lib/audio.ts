// Tiny silent WAV used to unlock audio playback during a user gesture (needed on iOS)
export const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export const toAudioDataUri = (base64Data: string, mimeType = "audio/mpeg"): string =>
  base64Data.startsWith("data:") ? base64Data : `data:${mimeType};base64,${base64Data}`;

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const getSupportedMimeType = (): string => {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};
