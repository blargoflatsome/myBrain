// SPEC §8 Link previews: draws public/og-image.png (1200×630), the picture shown when a link is shared.
// Run `npm run og-image` after changing the icon or messages.seo.imageLine. Uses Playwright's Chromium.
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { messages } from '../src/messages.ts'

const icon = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
// Colours from the calm palette (src/style.css: --bg, --ink, --accent, --muted).
const html = `<!doctype html><html><body style="margin:0">
<div style="box-sizing:border-box;width:1200px;height:630px;padding:96px;display:flex;align-items:center;gap:72px;
  background:#f6f4ef;font-family:'Segoe UI',system-ui,sans-serif;border-bottom:16px solid #3b6b8c">
  <div style="width:280px;height:280px;flex:none">${icon.replace('<svg ', '<svg width="280" height="280" ')}</div>
  <div style="display:flex;flex-direction:column;gap:28px">
    <div style="font-size:104px;font-weight:700;color:#2b2d2f;line-height:1.05">${escape(messages.appName)}</div>
    <div style="font-size:44px;color:#62666b;line-height:1.35">${escape(messages.seo.imageLine)}</div>
  </div>
</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: new URL('../public/og-image.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') })
await browser.close()
console.log('Wrote public/og-image.png')
