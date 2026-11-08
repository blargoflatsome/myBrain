import { expect, type Page } from '@playwright/test'

/** The main navigation that's showing: the bottom tabs on a phone, the side menu on a wider screen. */
export const mainNav = (page: Page) => page.locator('nav[aria-label="Main"]:visible')

/**
 * Go to a page the way a person would (SPEC §2 Navigation): a tab or side-menu link, or under More; the Dashboard
 * is "My Brain".
 */
export async function goTo(page: Page, name: string | RegExp) {
  if (name === 'Dashboard') {
    await page.getByRole('link', { name: 'My Brain' }).locator('visible=true').first().click()
    return
  }
  const nav = mainNav(page)
  await expect(nav).toBeVisible()
  const link = nav.getByRole('link', { name })
  if (await link.isVisible()) return link.click()
  await openMore(page)
  const sheet = page.getByRole('dialog', { name: 'More' })
  if (await sheet.isVisible()) return sheet.getByRole('link', { name }).click()
  await nav.getByRole('link', { name }).click()
}

/** Open More: the panel on a phone, or the rest of the side menu on a wider screen (if it's closed). */
export async function openMore(page: Page) {
  const more = mainNav(page).getByRole('button', { name: /^More/ })
  if ((await more.getAttribute('aria-expanded')) === 'true') return
  await more.click()
}
