// Small conveniences remembered on this device only (a fold-out left open, a chosen period). Storage can be blocked
// (a private window), so reading and writing never fail: the choice just isn't remembered.

/** The saved text, or null when there is none or storage is blocked. */
export function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Save a value; null removes it. */
export function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: it just isn't remembered.
  }
}

/** A saved JSON value, or null when there is none, it can't be read, or storage is blocked. */
export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(readKey(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

/** Save a value as JSON; null removes it. */
export function writeJson(key: string, value: unknown): void {
  writeKey(key, value === null ? null : JSON.stringify(value))
}
