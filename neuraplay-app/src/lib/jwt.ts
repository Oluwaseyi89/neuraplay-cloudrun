/** Seconds until a JWT expires (negative if already expired, null if unreadable) */
export const secondsUntilExpiry = (token: string, now: number = Date.now()): number | null => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp !== "number") return null;
    return payload.exp - now / 1000;
  } catch {
    return null;
  }
};
