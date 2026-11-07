// Reads the security headers in public/_headers (docs/SPEC.md §8), so the test server can send the same ones Netlify does.
import { readFileSync } from 'node:fs'

export function readHeaders(path: string): Record<string, string> {
  const headers: Record<string, string> = {}
  let inAll = false
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      inAll = raw.trim() === '/*'
      continue
    }
    if (!inAll) continue
    const at = raw.indexOf(':')
    if (at > 0) headers[raw.slice(0, at).trim()] = raw.slice(at + 1).trim()
  }
  return headers
}

/**
 * The same headers for the local test server: it also lets the page reach the stand-in Supabase on localhost and,
 * being plain http, doesn't upgrade requests to https.
 */
export function previewHeaders(path: string): Record<string, string> {
  const headers = readHeaders(path)
  const csp = headers['Content-Security-Policy']
  if (csp) {
    headers['Content-Security-Policy'] = csp
      .replace('connect-src ', 'connect-src http://localhost:54321 ws://localhost:54321 ')
      .replace(/;\s*upgrade-insecure-requests/, '')
  }
  return headers
}
