// SPEC §8 Link previews and Search listing: adds the share tags to index.html and writes sitemap.xml and the
// robots.txt Sitemap line, all with the site's own address (Netlify's URL when it builds).
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { shareTags, siteAddress, sitemap, sitemapLine } from '../src/seo/rules'

export function seo(): Plugin {
  const site = siteAddress(process.env.URL)
  let outDir = 'dist'
  return {
    name: 'my-brain-seo',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml: () => shareTags(site).map((attrs) => ({ tag: 'meta', attrs, injectTo: 'head' as const })),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(site) })
    },
    // public/robots.txt is copied as it is; the Sitemap line needs the address, so it's added after.
    closeBundle() {
      const robots = resolve(outDir, 'robots.txt')
      if (existsSync(robots) && !readFileSync(robots, 'utf8').includes('Sitemap:')) appendFileSync(robots, sitemapLine(site))
    },
  }
}
