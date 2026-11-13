// SPEC §8 Link previews and Search listing: the tags, sitemap and robots line built from the site's own address.
// Imported relatively so the build (vite.config.ts) can use it too.
import { messages } from '../messages'

/** The live site, used when a build doesn't say its own address (local builds). */
export const LIVE_SITE = 'https://myadhdbrain.netlify.app'
/** The share picture (public/og-image.png, made by `npm run og-image`). */
export const SHARE_IMAGE = { path: '/og-image.png', width: 1200, height: 630 }
/** The one page meant for search results: the home page (SPEC §5 Home page, the marketing page when signed out). */
export const INDEXED_PAGE = '/'

/** The site's address without a trailing slash: Netlify's `URL` when it builds, else the live site. */
export function siteAddress(netlifyUrl: string | undefined): string {
  return (netlifyUrl?.trim() || LIVE_SITE).replace(/\/+$/, '')
}

/** The description and share tags for index.html; the same on every page, so a preview never shows the link's details. */
export function shareTags(site: string): { name?: string; property?: string; content: string }[] {
  const m = messages.seo
  return [
    { name: 'description', content: m.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: messages.appName },
    { property: 'og:title', content: m.title },
    { property: 'og:description', content: m.description },
    { property: 'og:url', content: `${site}/` },
    { property: 'og:image', content: `${site}${SHARE_IMAGE.path}` },
    { property: 'og:image:width', content: String(SHARE_IMAGE.width) },
    { property: 'og:image:height', content: String(SHARE_IMAGE.height) },
    { property: 'og:image:alt', content: m.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: m.title },
    { name: 'twitter:description', content: m.description },
    { name: 'twitter:image', content: `${site}${SHARE_IMAGE.path}` },
    { name: 'twitter:image:alt', content: m.imageAlt },
  ]
}

/** sitemap.xml: just the home page. */
export function sitemap(site: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site}${INDEXED_PAGE}</loc></url>
</urlset>
`
}

/** The line added to robots.txt at build time. */
export const sitemapLine = (site: string) => `Sitemap: ${site}/sitemap.xml\n`
