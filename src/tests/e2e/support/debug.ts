import type { Page } from '@playwright/test'

/**
 * With PW_LOG=1, every page's console messages and uncaught errors print in the test output, each stamped with the
 * real milliseconds since the test set up its page (the page's own clock is often mocked), so a temporary
 * `console.log` in app code shows what happened and when (writing-tests skill, failing-tests.md).
 * FakeSupabase.install calls this, so nearly every browser test has it.
 */
const logged = new WeakSet<Page>()

export function logPage(page: Page) {
  if (!process.env.PW_LOG || logged.has(page)) return
  logged.add(page)
  const start = Date.now()
  const stamp = () => `[page +${Date.now() - start}ms]`
  page.on('console', (m) => console.log(`${stamp()} ${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => console.log(`${stamp()} uncaught: ${e.message}`))
}
