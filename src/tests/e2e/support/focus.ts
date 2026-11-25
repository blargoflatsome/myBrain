import { expect, type Locator } from '@playwright/test'

/**
 * SPEC §2 Accessibility: keyboard focus is on this element (it's the page's active element). Use it instead of
 * `toBeFocused`, which also needs the page to hold the browser window's focus (`document.hasFocus()`), and that isn't
 * the rule under test. A failure says what has focus instead and whether the page had the window's focus.
 */
export async function expectFocused(el: Locator) {
  await expect
    .poll(() =>
      el.evaluate(
        (node) => {
          const active = document.activeElement
          if (node === active) return 'focused'
          const name = active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 40)
          return `focus is on ${active?.tagName ?? 'nothing'} "${name ?? ''}" (page has window focus: ${document.hasFocus()})`
        },
        undefined,
        { timeout: 1000 },
      ),
    )
    .toBe('focused')
}
