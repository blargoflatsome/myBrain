import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

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
  if (expectTitle) await expect(page.getByRole('button', { name: new RegExp(`^${expectTitle}`) })).toBeVisible()
}

test.describe('Spec §5 Random Quest', () => {
  test('picking shows the quest’s full details with accept, re-roll and mark done', async ({ page }) => {
    server.seed('quests', [
      quest('q1', 'Build a birdhouse', { details: 'Plans are in the garage drawer.', time_bucket: 'half_day', energy_level: 'medicated' }),
    ])
    await openQuests(page, 'Build a birdhouse')
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()

    await expect(result(page)).toContainText(msg.quests.resultHeading)
    await expect(result(page).getByRole('heading')).toHaveText('Build a birdhouse')
    await expect(result(page)).toContainText('Plans are in the garage drawer.')
    await expect(result(page)).toContainText(msg.quests.time.half_day)
    await expect(result(page)).toContainText(msg.quests.energy.medicated)
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
    await page.getByRole('group', { name: "How's your energy?" }).getByRole('button', { name: msg.quests.energy.ugh }).click()
    await page.getByRole('group', { name: msg.quests.timeLabel }).getByRole('button', { name: msg.quests.time["30m"] }).click()
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Pick a quest for me/ }).click()
      await expect(result(page).getByRole('heading')).toHaveText('Sort the sock drawer')
    }
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
      await result(page).getByRole('button', { name: msg.quests.reroll }).click()
      await expect(result(page).getByRole('heading')).not.toHaveText(title)
    }
    expect(new Set(seen).size).toBe(4)
  })

  test('accepting moves it to In progress, where it can be marked done', async ({ page }) => {
    server.seed('quests', [quest('q1', 'Learn three juggling tricks')])
    await openQuests(page, 'Learn three juggling tricks')
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    await result(page).getByRole('button', { name: "I'll do it" }).click()
    await expect(page.getByTestId('quest-notice')).toHaveText(msg.quests.accepted)
    await expect(page.getByRole('heading', { name: msg.quests.inProgress })).toBeVisible()
    await expect.poll(() => server.written('quests').at(-1)?.status).toBe('accepted')

    await page.getByRole('button', { name: 'Mark done: Learn three juggling tricks' }).click()
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.questDone('Learn three juggling tricks'))
    await expect(page.getByRole('heading', { name: msg.quests.inProgress })).toHaveCount(0)
    // Quests aren't one-time tasks: it's back in the list, and the completion is logged (SPEC §5 Random Quest).
    await expect.poll(() => server.written('quests').at(-1)?.status).toBe('open')
    await expect.poll(() => server.written('quest_logs').at(-1)).toMatchObject({ quest_id: 'q1' })
    await expect(page.getByTestId('quest-row').filter({ hasText: 'Learn three juggling tricks' })).toBeVisible()
  })

  test('a quest can be edited, and deleted with Undo (SPEC §2)', async ({ page }) => {
    server.seed('quests', [quest('p1', 'Visit the planetarium', { energy_level: 'ugh', time_bucket: '30m' })])
    await openQuests(page, 'Visit the planetarium')
    await page.getByRole('button', { name: /^Visit the planetarium/ }).click()
    const dialog = page.getByRole('dialog', { name: msg.quests.editor.heading })
    await dialog.getByLabel(msg.quests.editor.energy).selectOption('ugh')
    await dialog.getByLabel(msg.quests.editor.time).selectOption('2h')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByRole('button', { name: /^Visit the planetarium/ })).toContainText(msg.quests.time["2h"])
    await expect.poll(() => server.written('quests').at(-1)).toMatchObject({ energy_level: 'ugh', time_bucket: '2h' })

    await page.getByRole('button', { name: /^Visit the planetarium/ }).click()
    await page.getByRole('button', { name: msg.quests.editor.delete }).click()
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.deleted('Visit the planetarium'))
    await expect(page.getByRole('button', { name: /^Visit the planetarium/ })).toHaveCount(0)
    await expect.poll(() => server.written('quests').at(-1)?.deleted_at).toBeTruthy()
  })

  test('an older quest with no time or energy still comes up with filters on', async ({ page }) => {
    server.seed('quests', [quest('cap', 'Try bouldering')])
    await openQuests(page, 'Try bouldering')
    await page.getByRole('group', { name: "How's your energy?" }).getByRole('button', { name: msg.quests.energy.ugh }).click()
    await page.getByRole('button', { name: /Pick a quest for me/ }).click()
    await expect(result(page).getByRole('heading')).toHaveText('Try bouldering')
  })
})

test.describe('Spec §5 Random Quest: tasks in the draw', () => {
  test('an Undated task can come up; Do it today dates it, and Done crosses it off', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T15:00:00Z') })
    server.seed('tasks', [{ id: 't1', title: 'call grandma', due_date: null, status: 'open', source: 'manual', priority: 1 }])
    await page.goto('/quests')
    const card = page.getByTestId('quest-task-result')
    // The task arrives with the first sync; until then there's nothing to pick.
    await expect(async () => {
      await page.getByRole('button', { name: msg.quests.pick }).click()
      await expect(card.getByRole('heading', { name: 'call grandma' })).toBeVisible({ timeout: 500 })
    }).toPass()
    await card.getByRole('button', { name: msg.quests.doToday }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', due_date: '2026-11-10' })
    await card.getByRole('button', { name: msg.quests.taskDone }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', status: 'done' })
    expect(server.written('quests')).toHaveLength(0)
  })
})
