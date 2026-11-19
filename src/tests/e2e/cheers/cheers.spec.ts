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
    ;(server.rpcResults.cheer_feed as unknown[]).push(post('p4', { mine: true, created_at: '2026-11-17T10:00:00Z' }))
    await page.goto('/cheers')
    await expect(postCard(page, 0).getByTestId('cheer-text')).toHaveText('I finished a 4-day-old task')
    await expect(postCard(page, 0)).toContainText(m.ago.hours(2))
    await expect(postCard(page, 1).getByTestId('cheer-text')).toHaveText(m.stuck)
    await expect(postCard(page, 0).getByTestId('cheer-counts')).toHaveCount(0)
    const mine = postCard(page, 2)
    await expect(mine.getByLabel(m.countLabel(m.reactions.got_this!, 2))).toBeVisible()
    // Not on my own post: no reacting, no hiding.
    await expect(mine.getByRole('group', { name: m.reactionsLabel })).toHaveCount(0)
    await expect(mine.getByTestId('cheer-hide')).toHaveCount(0)
    // No cheers yet: still the four icons, each with 0.
    for (const r of Object.keys(m.reactions)) await expect(postCard(page, 3).getByLabel(m.countLabel(m.reactions[r]!, 0))).toBeVisible()
  })

  test('Refresh loads the feed again and says it is up to date (SPEC §2 Buttons answer every press)', async ({ page }) => {
    await page.goto('/cheers')
    await expect(feed(page).getByTestId('cheer-post')).toHaveCount(3)
    server.rpcResults.cheer_feed = [post('p4', { body: 'Fresh one' })]
    await page.getByTestId('cheers-refresh').click()
    await expect(postCard(page, 0).getByTestId('cheer-text')).toHaveText('Fresh one')
    await expect(page.getByTestId('celebration-message')).toHaveText(m.refreshed)
  })

  test('a reaction is one of four and stays in one row: mine is pressed; tapping it takes it back, tapping another switches', async ({ page }) => {
    await page.goto('/cheers')
    const card = postCard(page, 0)
    const icon = (r: string) => card.getByTestId(`react-${r}`)
    await icon('strength').click()
    await expect(icon('strength')).toHaveAttribute('aria-pressed', 'true')
    // The others stay, unpressed, so one tap can switch.
    await expect(icon('proud')).toHaveAttribute('aria-pressed', 'false')
    expect(server.rpcArgs.find((c) => c.name === 'react_cheer')?.args).toEqual({ post: 'p1', p_reaction: 'strength' })
    // With the keyboard, so focus is checked too: it stays on the icon I pressed.
    await icon('strength').focus()
    await page.keyboard.press('Enter')
    await expect(icon('strength')).toHaveAttribute('aria-pressed', 'false')
    await expect(icon('strength')).toBeFocused()
    expect(server.rpcArgs.find((c) => c.name === 'unreact_cheer')?.args).toEqual({ post: 'p1' })
    await icon('proud').click()
    await expect(icon('proud')).toHaveAttribute('aria-pressed', 'true')
    server.rpcArgs.length = 0
    await icon('celebrate').click()
    await expect(icon('celebrate')).toHaveAttribute('aria-pressed', 'true')
    await expect(icon('proud')).toHaveAttribute('aria-pressed', 'false')
    expect(server.rpcArgs.filter((c) => c.name.endsWith('react_cheer'))).toEqual([
      { name: 'unreact_cheer', args: { post: 'p1' } },
      { name: 'react_cheer', args: { post: 'p1', p_reaction: 'celebrate' } },
    ])
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

  test('Hide posts from this person works from the post, straight away, with Undo', async ({ page }) => {
    server.rpcResults.block_cheer_author = 'h1'
    await page.goto('/cheers')
    await expect(feed(page).getByTestId('cheer-post')).toHaveCount(3)
    server.rpcResults.cheer_feed = (server.rpcResults.cheer_feed as { id: string }[]).filter((p) => p.id !== 'p1')
    await postCard(page, 0).getByTestId('cheer-hide').click()
    await expect(feed(page).getByTestId('cheer-post')).toHaveCount(2)
    expect(server.rpcArgs.find((c) => c.name === 'block_cheer_author')?.args).toEqual({ post: 'p1' })
    await expect(page.getByTestId('undo-message')).toHaveText(m.hidden)
    await page.getByTestId('undo-button').click()
    await expect.poll(() => server.rpcArgs.find((c) => c.name === 'cheer_unhide')?.args).toEqual({ hide: 'h1' })
  })

  test('Hidden people lists each by the post I hid them from, and Show again brings them back', { tag: '@phone' }, async ({ page }) => {
    server.rpcResults.cheer_hidden = [
      { id: 'h1', post_kind: 'did_it', post_body: PASTED, created_at: '2026-11-16T15:00:00Z' },
      { id: 'h2', post_kind: 'stuck', post_body: '', created_at: '2026-11-15T15:00:00Z' },
      { id: 'h3', post_kind: null, post_body: null, created_at: '2026-11-14T15:00:00Z' },
    ]
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/cheers')
    const fold = page.getByTestId('cheers-hidden')
    await fold.getByTestId('fold-header').click()
    await expect(fold.getByTestId('hidden-post')).toHaveText([PASTED, m.stuck, m.hiddenUnknown])
    // A pasted link still fits a phone (SPEC §2 Long text).
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await fold.getByTestId('show-again').first().click()
    await expect.poll(() => server.rpcArgs.find((c) => c.name === 'cheer_unhide')?.args).toEqual({ hide: 'h1' })
    await expect(fold.getByTestId('hidden-person')).toHaveCount(2)
    await expect(fold.getByTestId('show-again').first()).toBeFocused()
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
