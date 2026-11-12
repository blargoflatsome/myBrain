// SPEC §8 Search engines: only the sign-in page may be indexed; every other route sends noindex (public/_headers).
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
const INDEXED = ['/', '/sign-in']

describe('SPEC §8 Search engines', () => {
  const rules = noindexRules()

  it('every page but sign-in says noindex, including the public guest, Privacy and Terms pages', () => {
    expect(routePaths).toEqual(expect.arrayContaining(['/rsvp/x/x', '/privacy', '/terms', '/people/x']))
    const missing = routePaths.filter((p) => !INDEXED.includes(p) && !rules.some((r) => covers(r, p)))
    expect(missing).toEqual([])
  })

  it('the sign-in page can be indexed, and robots.txt lets crawlers read the noindex', () => {
    expect(rules.filter((r) => INDEXED.some((p) => covers(r, p)))).toEqual([])
    expect(robotsFile).not.toMatch(/^Disallow:\s*\/\s*$/m)
  })
})
