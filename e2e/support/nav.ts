import { expect, type Page } from '@playwright/test'

/** Go to a page through the left menu. On a phone the menu is closed until "Menu" is tapped. */
export async function goTo(page: Page, name: string | RegExp) {
  const menu = page.getByRole('button', { name: 'Menu' })
  if (await menu.isVisible()) await menu.click()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()
  await nav.getByRole('link', { name }).click()
}
