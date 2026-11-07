import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { dragHandle } from './support/drag'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T12:00:00Z') // Tue Nov 10, 7:00 am New York

const RID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const stepId = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`
let server: FakeSupabase

function seedMorning(extra: Record<string, unknown> = {}) {
  server.seed('routines', [{ id: RID, title: 'Daily Morning Routine', notify_time: '07:00', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-10', ...extra }])
  server.seed(
    'routine_steps',
    ['Wake up by 7am', 'Brush teeth', 'Shower', 'Skin care', 'Take medication'].map((title, i) => ({
      id: stepId(i + 1),
      routine_id: RID,
      position: i,
      title,
      start_date: '2026-11-10',
    })),
  )
}

async function open(page: Page, path: string, time = NOW) {
  await page.clock.install({ time })
  await page.goto(path)
}
const current = (page: Page) => page.getByTestId('current-step')

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Routines: one step at a time', () => {
  test('the run screen shows the first step with Skip and Completed', async ({ page }) => {
    seedMorning()
    await open(page, `/routines/${RID}/run`)
    await expect(page.getByRole('heading', { name: 'Daily Morning Routine' })).toBeVisible()
    await expect(page.getByTestId('step-of')).toHaveText('Step 1 of 5')
    await expect(current(page)).toHaveText('Wake up by 7am')
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible()
  })

  test('Completed crosses the step out, then shows the next step, and is recorded as completed', async ({ page }) => {
    seedMorning()
    await open(page, `/routines/${RID}/run`)
    await page.getByRole('button', { name: 'Completed' }).click()
    await expect(current(page)).toHaveClass(/crossing/)
    await page.clock.runFor(700)
    await expect(current(page)).toHaveText('Brush teeth')
    await expect(current(page)).not.toHaveClass(/crossing/)
    await expect.poll(() => server.written('routine_step_logs').at(-1)).toMatchObject({ step_id: stepId(1), status: 'completed' })
    await expect.poll(() => server.written('routine_runs')[0]).toMatchObject({ routine_id: RID, date: '2026-11-10' })
  })

  test('Skip moves on at once with no animation, and is recorded as skipped', async ({ page }) => {
    seedMorning()
    await open(page, `/routines/${RID}/run`)
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(current(page)).toHaveText('Brush teeth')
    await expect(current(page)).not.toHaveClass(/crossing/)
    await expect.poll(() => server.written('routine_step_logs').at(-1)).toMatchObject({ step_id: stepId(1), status: 'skipped' })
  })

  test('reaching the last step finishes the routine, even with skips', async ({ page }) => {
    seedMorning()
    await open(page, `/routines/${RID}/run`)
    for (const action of ['Skip', 'Skip', 'Skip', 'Skip']) await page.getByRole('button', { name: action }).click()
    await expect(current(page)).toHaveText('Take medication')
    await page.getByRole('button', { name: 'Completed' }).click()
    await page.clock.runFor(700)
    await expect(page.getByTestId('routine-finished')).toHaveText('Routine complete. Past you would be proud.')
    await expect.poll(() => server.written('routine_runs').at(-1)?.finished_at).toBeTruthy()
  })

  test('leaving partway and coming back continues at the next step', async ({ page }) => {
    seedMorning()
    await open(page, `/routines/${RID}/run`)
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(current(page)).toHaveText('Shower')
    await page.getByRole('link', { name: 'Back to routines' }).click()
    await expect(page.getByTestId('routine-status')).toHaveText('2 of 5 steps done')
    await page.getByRole('link', { name: 'Continue' }).click()
    await expect(current(page)).toHaveText('Shower')
  })
})

test.describe('Spec §5 Routines: list and stats', () => {
  test('stats count completed days against every scheduled day, and per step', async ({ page }) => {
    seedMorning({ start_date: '2026-11-07' })
    const run = (date: string, finished: boolean) => ({
      id: `${RID.slice(0, 24)}${date.replaceAll('-', '')}0000`,
      routine_id: RID,
      date,
      started_at: `${date}T12:00:00Z`,
      finished_at: finished ? `${date}T12:30:00Z` : null,
    })
    server.seed('routine_runs', [run('2026-11-07', true), run('2026-11-08', false)]) // Nov 9 never started
    server.seed('routine_step_logs', [
      ...[1, 2, 3, 4, 5].map((n) => ({ id: `l7-${n}`, run_id: run('2026-11-07', true).id, step_id: stepId(n), status: 'completed', logged_at: '2026-11-07T12:10:00Z' })),
      { id: 'l8-1', run_id: run('2026-11-08', false).id, step_id: stepId(1), status: 'skipped', logged_at: '2026-11-08T12:10:00Z' },
    ])
    server.seed('routine_steps', [1, 2, 3, 4, 5].map((n, i) => ({ id: stepId(n), routine_id: RID, position: i, title: ['Wake up by 7am', 'Brush teeth', 'Shower', 'Skin care', 'Take medication'][i], start_date: '2026-11-07' })))
    await open(page, '/routines')
    await expect(page.getByTestId('routine-stats')).toHaveText('Completed 1 of 3 days (33%)')
    await page.getByTestId('routine-stats').click()
    await expect(page.getByTestId('step-stat').first()).toContainText('1 of 3 done · 1 skipped')
  })

  test('a new routine has a title, reminder, weekdays and ordered steps', async ({ page }) => {
    await open(page, '/routines')
    await expect(page.getByText("Past you hasn't set up any routines yet.")).toBeVisible()
    await page.getByRole('button', { name: '+ New routine' }).click()
    const dialog = page.getByRole('dialog', { name: 'New routine' })
    await dialog.getByLabel('Title').fill('Evening wind-down')
    await dialog.getByLabel('Reminder time (optional)').fill('21:30')
    await dialog.getByLabel('Step 1', { exact: true }).fill('Phone on charger')
    await dialog.getByRole('button', { name: '+ Add step' }).click()
    await dialog.getByLabel('Step 2', { exact: true }).fill('Read')
    // Steps are sorted by drag and drop.
    await expect(dialog.getByText('Drag ⠿ to change the order.')).toBeVisible()
    await dragHandle(page, dialog.getByRole('button', { name: /^Reorder Read/ }), dialog.getByRole('button', { name: /^Reorder Phone on charger/ }), 'above')
    await expect(dialog.getByTestId('routine-step-row').first().getByRole('textbox')).toHaveValue('Read')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: 'Evening wind-down' })).toBeVisible()
    await expect.poll(() => server.written('routines')[0]).toMatchObject({ title: 'Evening wind-down', notify_time: '21:30', weekdays: [0, 1, 2, 3, 4, 5, 6] })
    await expect
      .poll(() => server.written('routine_steps').sort((a, b) => Number(a.position) - Number(b.position)).map((s) => s.title))
      .toEqual(['Read', 'Phone on charger'])
  })

  test('steps can also be moved with the arrow keys on their handle', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: '+ New routine' }).click()
    const dialog = page.getByRole('dialog', { name: 'New routine' })
    await dialog.getByLabel('Title').fill('Morning')
    await dialog.getByLabel('Step 1', { exact: true }).fill('Wake')
    await dialog.getByRole('button', { name: '+ Add step' }).click()
    await dialog.getByLabel('Step 2', { exact: true }).fill('Stretch')
    await dialog.getByRole('button', { name: '+ Add step' }).click()
    await dialog.getByLabel('Step 3', { exact: true }).fill('Coffee')
    await dialog.getByRole('button', { name: /^Reorder Coffee/ }).focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    const titles = dialog.getByTestId('routine-step-row').getByRole('textbox')
    await expect(titles.nth(0)).toHaveValue('Coffee')
    await expect(titles.nth(1)).toHaveValue('Wake')
    await expect(titles.nth(2)).toHaveValue('Stretch')
  })

  test('a weekdays-only routine shows "Not today" on Saturday and offers no Start', async ({ page }) => {
    seedMorning({ weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-02' })
    await open(page, '/routines', new Date('2026-11-14T15:00:00Z'))
    await expect(page.getByTestId('routine-status')).toHaveText('Not today')
    await expect(page.getByRole('link', { name: 'Start' })).toHaveCount(0)
  })

  test('a routine can be deleted after confirming', async ({ page }) => {
    seedMorning()
    await open(page, '/routines')
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Delete routine' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this routine?' })
    await expect(confirm).toContainText('"Daily Morning Routine" and its history will be removed from all your devices.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'Daily Morning Routine' })).toHaveCount(0)
    await expect.poll(() => server.written('routines').at(-1)?.deleted_at).toBeTruthy()
  })
})
