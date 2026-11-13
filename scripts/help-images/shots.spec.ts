// Takes the Help and home page pictures (SPEC §5 Home page and Help): `npm run docs:images` (all) or
// `npm run docs:images -- -g capture` (names matching "capture"). Phone size, dark mode, sample data, a highlight
// ring around what to tap. Saved as WebP in public/help/, named after the shot.
import { writeFileSync, mkdirSync } from 'node:fs'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { FakeSupabase } from '../../src/tests/e2e/support/fakeSupabase'
import { NOW, seedSample } from './sample'
import { SHOTS } from './shots'

const OUT = 'public/help'

/** Draws the highlight ring over an element (an overlay, so a parent's overflow never clips it). Inside an open
 *  window it goes in the window, which is drawn above everything else on the page. */
async function ring(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await target.evaluate((t) => {
    const b = t.getBoundingClientRect()
    const pad = 6
    const el = document.createElement('div')
    el.setAttribute('data-help-ring', '')
    Object.assign(el.style, {
      position: 'fixed', left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px`,
      border: '4px solid #ffd166', borderRadius: '16px', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)', zIndex: '2147483647', pointerEvents: 'none',
      margin: '0',
    })
    ;(t.closest('dialog[open]') ?? document.body).append(el)
  })
}

/** Turns a PNG screenshot into WebP with the browser's own encoder, so no image tool is needed. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const data = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    return canvas.toDataURL('image/webp', 0.8).split(',')[1]!
  }, png.toString('base64'))
  return Buffer.from(data, 'base64')
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = !!shot.accountOpen
    await server.install(page)
    seedSample(server)
    shot.seed?.(server)
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.clock.install({ time: NOW })
    await page.goto(shot.path)
    // Pop-ups (celebrations, alert banners) would cover the picture.
    await page.addStyleTag({ content: '[data-testid="celebration"], [data-testid="confetti-layer"], [data-testid="alert-banner"] { display: none !important; }' })
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await shot.ready?.(page)
    if (shot.ring) await ring(page, shot.ring(page))
    await page.waitForTimeout(300)
    const png = await page.screenshot()
    writeFileSync(`${OUT}/${shot.name}.webp`, await toWebp(page, png))
  })
}
