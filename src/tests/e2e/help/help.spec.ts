import { expect, test } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
import { messages as msg } from '../../../messages'

// SPEC §5 Help: under More and on the Account page; topic links take you (and keyboard focus) to the topic.
test.describe('SPEC §5 Help', () => {
  test.beforeEach(async ({ page }) => {
    await new FakeSupabase().install(page)
  })

  test('Help is under More, and a topic link moves focus to that topic', async ({ page }) => {
    await page.goto('/tasks')
    await goTo(page, msg.nav.help)
    await expect(page).toHaveURL(/\/help$/)
    const topic = msg.help.topics.at(-1)!
    await page.getByRole('navigation', { name: msg.help.topicsLabel }).getByRole('link', { name: topic.title }).click()
    await expect(page.getByTestId('help-topic').last()).toBeFocused()
    await expect(page.getByRole('heading', { name: topic.title, level: 2 })).toBeInViewport()
  })

  test('the Account page links to Help', async ({ page }) => {
    await page.goto('/account')
    await page.getByTestId('account-help').getByRole('link').click()
    await expect(page).toHaveURL(/\/help$/)
  })
})
