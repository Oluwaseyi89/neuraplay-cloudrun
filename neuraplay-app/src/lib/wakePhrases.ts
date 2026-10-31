import type { GameType } from "../types/game";

export const WAKE_PHRASES: Record<GameType, string[]> = {
  fifa: ["hey fifa", "fifa", "fee fa", "vyfa", "vifa", "fiver", "ea fc", "ea football", "hey ea"],
  lol: ["hey lol", "lol", "league", "league of legends", "lowl", "lawl", "hey league", "hey legends", "legends"],
};

export const getWakePrompt = (game: GameType): string => `Say '${WAKE_PHRASES[game][0]}'`;

export function levenshteinDistance(a: string, b: string): number {
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const v0 = new Array(blen + 1).fill(0);
  const v1 = new Array(blen + 1).fill(0);

  for (let j = 0; j <= blen; j++) v0[j] = j;
  for (let i = 0; i < alen; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < blen; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= blen; j++) v0[j] = v1[j];
  }
  return v1[blen];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

const normalize = (text: string): string =>
  text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Whole-word or close fuzzy match against the game's wake phrases, so words that
 * merely contain a phrase (e.g. "league" or "yeah" containing "ea") never match.
 */
export const detectWakeIntent = (heard: string, game: GameType, threshold: number): boolean => {
  const text = normalize(heard);
  if (!text) return false;

  return WAKE_PHRASES[game].some((phrase) =>
    new RegExp(`\\b${phrase}\\b`).test(text) || similarity(text, phrase) >= threshold
  );
};
