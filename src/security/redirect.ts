// docs/SPEC.md §8 Security: where the app may send me after a step like the one-time phone question.

/** Only a page inside this app: "/journal" yes; "//other-site.com", "/\other-site.com" or "https://…" no. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?![\\/])/.test(next) ? next : '/'
}
