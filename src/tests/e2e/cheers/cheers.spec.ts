import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

const m = msg.cheers
const NOW = new Date('2026-11-17T17:00:00Z')
const PASTED = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query'
let server: FakeSupabase

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: 'did_it', body: 'I finished a 4-day-old task', created_at: '2026-11-17T15:00:00Z', mine: false, my_reaction: null,
  got_this: null, proud: null, strength: null, celebrate: null, ...extra,
})

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
  server.rpcResults.cheer_feed = [
    post('p1'),
    post('p2', { kind: 'stuck', body: '', created_at: '2026-11-17T16:50:00Z' }),
    post('p3', { body: PASTED, mine: true, got_this: 2, proud: 1, strength: 0, celebrate: 1 }),
  ]
  server.rpcResults.react_cheer = true
})

const feed = (page: Page) => page.getByTestId('cheers-feed')
const postCard = (page: Page, i: number) => feed(page).getByTestId('cheer-post').nth(i)

test.describe('Spec §5 Cheers', () => {
  test('the feed is anonymous: posts show what was said and when; only my own shows its counts', async ({ page }) => {
    await page.goto('/cheers')
    await expect(postCard(page, 0).getByTestId('cheer-text')).toHaveText('I finished a 4-day-old task')
    await expect(postCard(page, 0)).toContainText(m.ago.hours(2))
    await expect(postCard(page, 1).getByTestId('cheer-text')).toHaveText(m.stuck)
    await expect(postCard(page, 0).getByTestId('cheer-counts')).toHaveCount(0)
    const mine = postCard(page, 2)
    await expect(mine.getByLabel(m.countLabel(m.reactions.got_this!, 2))).toBeVisible()
    // Not on my own post: no reacting, no hiding.
    await expect(mine.getByRole('button', { name: m.reactWith(m.reactions.proud!) })).toHaveCount(0)
    await expect(mine.getByTestId('cheer-more')).toHaveCount(0)
  })

  test('Refresh loads the feed again and says it is up to date (SPEC §2 Buttons answer every press)', async ({ page }) => {
    await page.goto('/cheers')
    await expect(feed(page).getByTestId('cheer-post')).toHaveCount(3)
    server.rpcResults.cheer_feed = [post('p4', { body: 'Fresh one' })]
    await page.getByTestId('cheers-refresh').click()
    await expect(postCard(page, 0).getByTestId('cheer-text')).toHaveText('Fresh one')
    await expect(page.getByTestId('celebration-message')).toHaveText(m.refreshed)
  })

  test('a reaction is one of four, and only I see which one I sent; tapping it again takes it back to pick again', async ({ page }) => {
    await page.goto('/cheers')
    const card = postCard(page, 0)
    await card.getByRole('button', { name: m.reactWith(m.reactions.strength!) }).click()
    const sent = card.getByTestId('cheer-sent')
    await expect(sent).toHaveText(m.youSent(m.reactions.strength!))
    await expect(card.getByRole('button', { name: m.reactWith(m.reactions.proud!) })).toHaveCount(0)
    expect(server.rpcArgs.find((c) => c.name === 'react_cheer')?.args).toEqual({ post: 'p1', p_reaction: 'strength' })
    // With the keyboard, so focus is checked too: it stays in the post when the button I pressed goes away.
    await sent.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('button', { name: m.reactWith(m.reactions.got_this!) })).toBeFocused()
    expect(server.rpcArgs.find((c) => c.name === 'unreact_cheer')?.args).toEqual({ post: 'p1' })
    await card.getByRole('button', { name: m.reactWith(m.reactions.proud!) }).click()
    await expect(sent).toHaveText(m.youSent(m.reactions.proud!))
  })

  test("while I'm stuck, I got unstuck! takes I'm stuck's place, so I can post it without being offered", async ({ page }) => {
    server.rpcResults.cheer_am_stuck = true
    server.rpcResults.post_cheer = 'new-post'
    await page.goto('/cheers')
    await page.getByTestId('cheers-unstuck').click()
    await expect(page.getByTestId('cheers-stuck')).toBeVisible()
    expect(server.rpcArgs.find((c) => c.name === 'post_cheer')?.args).toEqual({ p_kind: 'unstuck', p_body: '' })
  })

  test('I did it! posts my own words, up to 140 characters', async ({ page }) => {
    await page.goto('/cheers')
    await page.getByTestId('cheers-did-it').click()
    const box = page.getByTestId('did-it-text')
    await expect(box).toBeFocused()
    await page.getByTestId('did-it-post').click()
    await expect(page.getByTestId('did-it-error')).toHaveText(m.needText)
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await box.fill('x'.repeat(200))
    await expect(box).toHaveValue('x'.repeat(140))
    await expect(page.getByTestId('did-it-left')).toHaveText(m.left(0))
    await box.fill('  I did an ugh quest!  ')
    await page.getByTestId('did-it-post').click()
    await expect(page.getByTestId('did-it-form')).toBeHidden()
    expect(server.rpcArgs.find((c) => c.name === 'post_cheer')?.args).toEqual({ p_kind: 'did_it', p_body: 'I did an ugh quest!' })
  })

  test('the post limit says so instead of failing quietly', async ({ page }) => {
    await page.route('**/rest/v1/rpc/post_cheer', (route) => route.fulfill({ status: 400, json: { code: 'P0429', message: 'Post limit reached' } }))
    await page.goto('/cheers')
    await page.getByTestId('cheers-stuck').click()
    await expect(page.getByTestId('cheers-post-error')).toHaveText(m.limit)
  })

  test("I'm stuck: how many others are, one encouraging line, and Breathe", async ({ page }) => {
    server.rpcResults.post_cheer = 'new-post'
    server.rpcResults.cheer_stuck_count = 3
    await page.goto('/cheers')
    await page.getByTestId('cheers-stuck').click()
    const panel = page.getByTestId('stuck-panel')
    await expect(panel.getByRole('heading', { name: m.notAlone })).toBeVisible()
    await expect(panel.getByTestId('stuck-others')).toHaveText(m.othersStuck(3))
    expect(m.stuckLines).toContain(await panel.getByTestId('stuck-line').textContent())
    expect(server.rpcArgs.find((c) => c.name === 'post_cheer')?.args).toEqual({ p_kind: 'stuck', p_body: '' })
    await panel.getByTestId('stuck-breathe').click()
    await expect(page.getByRole('dialog', { name: msg.breathe.heading })).toBeVisible()
  })

  test('nobody else stuck: the count is hidden, never "0 others"', async ({ page }) => {
    server.rpcResults.post_cheer = 'new-post'
    server.rpcResults.cheer_stuck_count = 0
    await page.goto('/cheers')
    await page.getByTestId('cheers-stuck').click()
    await expect(page.getByTestId('stuck-line')).toBeVisible()
    await expect(page.getByTestId('stuck-others')).toHaveCount(0)
  })

  test('Hide posts from this person works from the post, after a confirmation', async ({ page }) => {
    await page.goto('/cheers')
    await postCard(page, 0).getByTestId('cheer-more').click()
    await postCard(page, 0).getByTestId('cheer-hide').click()
    await page.getByRole('alertdialog').getByRole('button', { name: m.hideYes }).click()
    await expect.poll(() => server.rpcArgs.find((c) => c.name === 'block_cheer_author')?.args).toEqual({ post: 'p1' })
  })

  test('finishing an old task offers "Share it in Cheers?", and Share fills I did it! with its age, not its title', async ({ page }) => {
    server.seed('tasks', [{ id: 't-old', title: 'Call the bank about the loan', due_date: '2026-11-13', status: 'open', source: 'manual', created_at: '2026-11-10T00:00:00Z' }])
    await page.goto('/tasks')
    await page.getByRole('button', { name: 'Cross off Call the bank about the loan' }).click()
    await expect(page.getByTestId('undo-message')).toHaveText(m.offer.didIt)
    await page.getByTestId('undo-button').click()
    await expect(page).toHaveURL(/\/cheers$/)
    await expect(page.getByTestId('did-it-text')).toHaveValue(m.suggest.oldTask(4))
  })
})
