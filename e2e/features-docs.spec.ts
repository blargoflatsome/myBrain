import { expect, test } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// SPEC §5 Features and Docs pages: public pages for new people, kept in step with the app.
test.describe('Spec §5 Features and Docs pages (signed out)', () => {
  test('the sign-in page links to both, and anyone can open them', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('link', { name: 'Features' }).click()
    await expect(page).toHaveURL(/\/features$/)
    await expect(page).toHaveTitle('Features · My Brain')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A second brain for busy, wandering minds')
    // A brief summary of every feature.
    for (const name of ['Quick capture', 'Tasks', 'Priority tasks', 'Habits and streaks', 'Routines', 'Journal', 'Calendar', 'Invitations', 'Connections', 'Your people', 'The Vault', 'Random Quest', 'Orphans', 'Post Its', 'Dashboard', 'Focus timer', 'Search and tags', 'Reminders that reach you']) {
      await expect(page.getByTestId('feature').filter({ has: page.getByRole('heading', { name, exact: false }) }).first()).toBeVisible()
    }
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.getByRole('heading', { name: 'How to use My Brain', level: 1 })).toBeVisible()
  })

  test('the Docs page has a contents list and the Work and Personal tags example', async ({ page }) => {
    await page.goto('/docs')
    const contents = page.getByRole('navigation', { name: 'Contents' })
    await expect(contents.getByRole('link')).toHaveCount(13)
    await contents.getByRole('link', { name: /Search and tags/ }).click()
    await expect(page).toHaveURL(/#tags$/)
    const tags = page.locator('#tags')
    await expect(tags.getByRole('heading', { name: 'Example: keeping Work and Personal apart' })).toBeVisible()
    await expect(tags).toContainText('#work')
    await expect(tags).toContainText('#personal')
    await expect(tags).toContainText('Open Search and tap #work without typing anything')
  })
})

test.describe('Spec §5 Features and Docs pages (signed in)', () => {
  test('Help in the menu opens the Docs page', async ({ page }) => {
    const server = new FakeSupabase()
    await server.install(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const menu = page.getByRole('button', { name: 'Menu' })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Help' }).click()
    await expect(page.getByRole('heading', { name: 'How to use My Brain', level: 1 })).toBeVisible()
  })
})
