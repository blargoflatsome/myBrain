// SPEC §8 Search listing and 404s, Link previews.
import { describe, expect, it } from 'vitest'
import netlifyFile from '../../../../netlify.toml?raw'
import sharePicture from '../../../../public/og-image.png?inline'
import routerFile from '../../../router/index.ts?raw'
import { setCanonical } from '@/seo/canonical'
import { LIVE_SITE, SHARE_IMAGE, shareTags, siteAddress } from '@/seo/rules'

/** Netlify's redirect rules, in order. */
const redirects = [...netlifyFile.matchAll(/from = "([^"]+)"\s+to = "\/index\.html"\s+status = (\d+)/g)].map((m) => ({
  from: m[1]!,
  status: Number(m[2]),
}))
const CATCH_ALL = '/:pathMatch(.*)*'
const routePaths = [...routerFile.matchAll(/path: '([^']+)'/g)].map((m) => m[1]!)

describe('SPEC §8 Search listing and 404s', () => {
  it('Netlify serves every page the app has with 200, and anything else with 404', () => {
    const served = redirects.filter((r) => r.status === 200).map((r) => r.from)
    expect(served.sort()).toEqual(routePaths.filter((p) => p !== CATCH_ALL).sort())
    expect(redirects.at(-1)).toEqual({ from: '/*', status: 404 })
    expect(routePaths.at(-1)).toBe(CATCH_ALL)
  })

  it('only the home page has a canonical link, and leaving it removes the link', () => {
    setCanonical('/')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${location.origin}/`)
    setCanonical('/tasks')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('SPEC §8 Link previews', () => {
  it.each([
    ['https://copy.example.org/', 'https://copy.example.org'],
    [undefined, LIVE_SITE],
  ])('preview addresses are full addresses on the site the build is for (%s)', (netlifyUrl, site) => {
    const links = shareTags(siteAddress(netlifyUrl)).filter((t) => /:(url|image)$/.test(t.property ?? t.name ?? ''))
    expect(links.length).toBeGreaterThan(0)
    for (const t of links) expect(t.content.startsWith(`${site}/`)).toBe(true)
  })

  it('the share picture exists at the size the tags promise', () => {
    expect(SHARE_IMAGE.path).toBe('/og-image.png')
    const png = new DataView(Uint8Array.from(atob(sharePicture.split(',')[1]!), (c) => c.charCodeAt(0)).buffer)
    // A PNG's width and height are at bytes 16 and 20.
    expect({ width: png.getUint32(16), height: png.getUint32(20) }).toEqual({
      width: SHARE_IMAGE.width,
      height: SHARE_IMAGE.height,
    })
  })
})
