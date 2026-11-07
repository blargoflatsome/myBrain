import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

let server: FakeSupabase

function quest(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, status: 'open', times_picked: 0, ...extra }
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

const result = (page: Page) => page.getByTestId('quest-result')

/** Open the Quests screen and wait until the synced quests are listed. */
async function openQuests(page: Page, expectTitle?: string) {
  await page.goto('/quests')
  if (expectTitle) await expect(page.getByRole('button', { name: new RegExp(expectTitle) })).toBeVisible()
}

test.describe('Spec §5 Random Quest', () => {
  test('picking shows the quest’s full details with accept, re-roll and mark done', async ({ page }) => {
    server.seed('quests', [
      quest('q1', 'Build a birdhouse', { details: 'Plans are in the garage drawer.', time_bucket: 'half_day', energy_level: 'medicated' }),
    ])
    await openQuests(page, 'Build a birdhouse')
    await expect(page.getByText('Bored? We have a quest for that.')).toBeVisible()
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()

    await expect(result(page)).toContainText('Past you thought this would be fun:')
    await expect(result(page).getByRole('heading')).toHaveText('Build a birdhouse')
    await expect(result(page)).toContainText('Plans are in the garage drawer.')
    await expect(result(page)).toContainText('Half a day')
    await expect(result(page)).toContainText('Medicated')
    for (const name of ["I'll do it", 'Re-roll', 'Mark done']) {
      await expect(result(page).getByRole('button', { name })).toBeVisible()
    }
    await expect.poll(() => server.written('quests').at(-1)).toMatchObject({ id: 'q1', times_picked: 1 })
    expect(server.written('quests').at(-1)?.last_picked_at).toBeTruthy()
  })

  test('filters by energy (Ugh < Fun < Needs setup < Medicated) and time available', async ({ page }) => {
    server.seed('quests', [
      quest('big', 'Repaint the fence', { time_bucket: 'full_day', energy_level: 'medicated' }),
      quest('small', 'Sort the sock drawer', { time_bucket: '30m', energy_level: 'ugh' }),
    ])
    await openQuests(page, 'Sort the sock drawer')
    await page.getByRole('group', { name: "How's your energy?" }).getByRole('button', { name: 'Ugh' }).click()
    await page.getByRole('group', { name: 'How much time do you have?' }).getByRole('button', { name: '30 min' }).click()
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Pick a quest for me/ }).click()
      await expect(result(page).getByRole('heading')).toHaveText('Sort the sock drawer')
    }
  })

  test('when nothing fits, past you suggests changing the filters', async ({ page }) => {
    server.seed('quests', [quest('big', 'Repaint the fence', { time_bucket: 'full_day' })])
    await openQuests(page, 'Repaint the fence')
    await page.getByRole('group', { name: 'How much time do you have?' }).getByRole('button', { name: '30 min' }).click()
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    await expect(page.getByTestId('quest-notice')).toHaveText(
      "Past you didn't leave a quest that fits right now. Try a different time or energy, or add one.",
    )
    await expect(result(page)).toHaveCount(0)
  })

  test('re-roll skips the last 3 picked quests', async ({ page }) => {
    server.seed('quests', ['a', 'b', 'c', 'd'].map((id) => quest(id, `Quest ${id}`)))
    await openQuests(page, 'Quest d')
    const seen: string[] = []
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    for (let i = 0; i < 4; i++) {
      const title = (await result(page).getByRole('heading').textContent())!
      expect(seen.slice(-3)).not.toContain(title)
      seen.push(title)
      if (i === 3) break
      await result(page).getByRole('button', { name: 'Re-roll' }).click()
      await expect(result(page).getByRole('heading')).not.toHaveText(title)
    }
    expect(new Set(seen).size).toBe(4)
  })

  test('accepting moves it to In progress, where it can be marked done', async ({ page }) => {
    server.seed('quests', [quest('q1', 'Learn three juggling tricks')])
    await openQuests(page, 'Learn three juggling tricks')
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    await result(page).getByRole('button', { name: "I'll do it" }).click()
    await expect(page.getByTestId('quest-notice')).toHaveText('Quest accepted. Past you would be thrilled.')
    await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible()
    await expect.poll(() => server.written('quests').at(-1)?.status).toBe('accepted')

    await page.getByRole('button', { name: 'Mark done: Learn three juggling tricks' }).click()
    await expect(page.getByTestId('quest-notice')).toHaveText('Quest complete. Past you would be proud.')
    await expect(page.getByRole('heading', { name: 'In progress' })).toHaveCount(0)
    await expect.poll(() => server.written('quests').at(-1)?.status).toBe('done')
  })

  test('the Quests page has no Add box; quests come from Capture', async ({ page }) => {
    await page.goto('/quests')
    await expect(page.getByText("Past you hasn't added any quests yet. Tap Capture and choose Quest")).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Add a quest' })).toHaveCount(0)

    await page.getByRole('button', { name: '+ Capture' }).click()
    const dialog = page.getByRole('dialog', { name: 'Capture' })
    await dialog.getByRole('group', { name: 'What are you capturing?' }).getByRole('button', { name: 'Quest' }).click()
    await dialog.getByLabel('Title', { exact: true }).fill('Visit the planetarium')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('button', { name: /Visit the planetarium/ })).toContainText('30 min')
    await expect(page.getByRole('button', { name: /Visit the planetarium/ })).toContainText('Ugh')
  })

  test('a quest can be edited and deleted after confirming', async ({ page }) => {
    server.seed('quests', [quest('p1', 'Visit the planetarium', { energy_level: 'ugh', time_bucket: '30m' })])
    await openQuests(page, 'Visit the planetarium')
    await page.getByRole('button', { name: /Visit the planetarium/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit quest' })
    await dialog.getByLabel('Energy needed').selectOption('ugh')
    await dialog.getByLabel('Time needed').selectOption('2h')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: /Visit the planetarium/ })).toContainText('2 hours')
    await expect.poll(() => server.written('quests').at(-1)).toMatchObject({ energy_level: 'ugh', time_bucket: '2h' })

    await page.getByRole('button', { name: /Visit the planetarium/ }).click()
    await page.getByRole('button', { name: 'Delete quest' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this quest?' })
    await expect(confirm).toContainText('"Visit the planetarium" will be removed from all your devices.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('button', { name: /Visit the planetarium/ })).toHaveCount(0)
    await expect.poll(() => server.written('quests').at(-1)?.deleted_at).toBeTruthy()
  })

  test('an older quest with no time or energy still comes up with filters on', async ({ page }) => {
    server.seed('quests', [quest('cap', 'Try bouldering')])
    await openQuests(page, 'Try bouldering')
    await page.getByRole('group', { name: "How's your energy?" }).getByRole('button', { name: 'Ugh' }).click()
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    await expect(result(page).getByRole('heading')).toHaveText('Try bouldering')
  })
})
