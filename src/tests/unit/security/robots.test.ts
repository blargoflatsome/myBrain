// SPEC §8 Search engines: only the home page may be indexed; every other route sends noindex (public/_headers).
import { describe, expect, it } from 'vitest'
import headersFile from '../../../../public/_headers?raw'
import robotsFile from '../../../../public/robots.txt?raw'
import routerFile from '../../../router/index.ts?raw'

/** The paths in public/_headers whose rules say noindex. */
function noindexRules(): string[] {
  const rules: string[] = []
  let path = ''
  for (const line of headersFile.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) path = line.trim()
    else if (/^\s*X-Robots-Tag:.*noindex/i.test(line)) rules.push(path)
  }
  return rules
}

/** Whether a Netlify header rule (exact, or ending in /*) covers a path. */
const covers = (rule: string, path: string) => (rule.endsWith('/*') ? path.startsWith(rule.slice(0, -1)) : rule === path)

/** Every route in the app, with its :params filled in. */
// The catch-all (Page not found) answers 404, so it needs no noindex.
const routePaths = [...routerFile.matchAll(/path: '([^']+)'/g)]
  .map((m) => m[1]!)
  .filter((p) => !p.startsWith('/:pathMatch'))
  .map((p) => p.replace(/:[^/]+/g, 'x'))
const INDEXED = ['/']

describe('SPEC §8 Search engines', () => {
  const rules = noindexRules()

  it('every page but the home page says noindex, including the public guest, Privacy and Terms pages', () => {
    expect(routePaths).toEqual(expect.arrayContaining(['/rsvp/x/x', '/privacy', '/terms', '/people/x']))
    const missing = routePaths.filter((p) => !INDEXED.includes(p) && !rules.some((r) => covers(r, p)))
    expect(missing).toEqual([])
  })

  it('the home page can be indexed, and robots.txt lets crawlers read the noindex', () => {
    expect(rules.filter((r) => INDEXED.some((p) => covers(r, p)))).toEqual([])
    expect(robotsFile).not.toMatch(/^Disallow:\s*\/\s*$/m)
  })
})

/** Each path in public/_headers with its Content-Security-Policy, when it sets one. */
function policies(): Record<string, string> {
  const found: Record<string, string> = {}
  let path = ''
  for (const line of headersFile.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) path = line.trim()
    else if (/^\s*Content-Security-Policy:/.test(line)) found[path] = line.slice(line.indexOf(':') + 1).trim()
  }
  return found
}

describe('SPEC §9 TV app, The launcher: only the TV page may be framed', () => {
  it('the TV page has the site-wide policy, but may be framed by the launcher (a local file) or the site', () => {
    const csp = policies()
    expect(csp['/*']).toContain("frame-ancestors 'none'")
    expect(csp['/tv/*']).toBe(csp['/*']!.replace("frame-ancestors 'none'", "frame-ancestors 'self' file:"))
  })

  it('no other path changes the site-wide policy', () => {
    expect(Object.keys(policies()).sort()).toEqual(['/*', '/tv/*'])
  })
})
