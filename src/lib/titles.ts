// A title is one line of at most 500 characters (docs/SPEC.md §8 limits). Every kind's add keeps to it.
export const TITLE_MAX = 500

/** The title trimmed, and shortened (ending in …) when it's over the limit. */
export function clipTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX - 1).trimEnd()}…` : trimmed
}
