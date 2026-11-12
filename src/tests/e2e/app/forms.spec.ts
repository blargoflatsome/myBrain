import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

const DAY = '2026-11-10'

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'

const LONG_WORD = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

const lastWrite = (table: string) => server.written(table).at(-1)

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Forms: optional details in More details, formatted notes', () => {
  test('a task editor shows notes in view; only priority and tags are in More details', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await expect(dialog.getByTestId('task-more').getByRole('textbox', { name: msg.tasks.editor.notes })).toHaveCount(0)
    await expect(dialog.getByTestId('task-more')).toContainText(msg.tasks.editor.moreSummary)
    const notes = dialog.getByRole('textbox', { name: msg.tasks.editor.notes })
    await notes.click()
    await page.keyboard.type('Bring the ')
    await dialog.getByRole('button', { name: msg.editor.bold }).click()
    await page.keyboard.type('checkbook')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')?.notes).toBe('<p>Bring the <strong>checkbook</strong></p>')
  })

  test('More details opens by itself when something in it is set, and old plain notes still show', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: `${LONG_LINE}\n${LONG_WORD}`, due_date: DAY, priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const notes = page.getByRole('dialog', { name: msg.tasks.editor.heading }).getByRole('textbox', { name: msg.tasks.editor.notes })
    await expect(notes).toBeVisible()
    await expect(notes).toContainText(LONG_LINE)
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await noSidewaysScroll(page)).toBe(true)
  })

  test('Capture: a task shows notes and priority in view, with no More details', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('button', { name: msg.search.type.task, exact: true }).click()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
    await page.getByLabel(msg.capture.titleLabel, { exact: true }).fill('Buy stamps')
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toBeVisible()
    await page.getByRole('group', { name: msg.journal.priority }).getByRole('button', { name: msg.tasks.priority.high }).click()
    await page.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')).toMatchObject({ title: 'Buy stamps', priority: 3 })
  })

  test('a form with only one optional extra has no More details: routine and priority task editors, Capture Vault', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: /New routine/ }).click()
    const routine = page.getByRole('dialog', { name: msg.routines.editor.newHeading })
    await expect(routine.getByRole('combobox', { name: msg.tags.add })).toBeVisible()
    await expect(routine.getByText(msg.forms.moreOptions)).toHaveCount(0)

    await open(page, '/tasks')
    await page.getByRole('tab', { name: msg.journal.priority }).click()
    await page.getByRole('button', { name: msg.priority.add }).click()
    const priority = page.getByRole('dialog', { name: msg.priority.editor.newHeading })
    await expect(priority.getByRole('textbox', { name: msg.capture.detailsLabel })).toBeVisible()
    await expect(priority.getByText(msg.forms.moreOptions)).toHaveCount(0)

    await open(page, '/capture')
    await page.getByRole('button', { name: msg.nav.vault, exact: true }).click()
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toBeVisible()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
  })

  test('Capture: a quest shows energy, time and details in view (no More details)', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('button', { name: msg.search.type.quest, exact: true }).click()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
    const quest = page.getByTestId('capture-quest')
    await expect(quest.getByRole('button', { name: msg.quests.energy.ugh })).toBeVisible()
    await expect(quest.getByRole('button', { name: msg.quests.time["30m"] })).toBeVisible()
  })
})

test.describe('Spec §5 Forms: an open fold-out stands out', () => {
  test('an open fold-out has a tinted header; a closed one inside an open group stays plain, with its arrow unturned', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const reminders = page.getByRole('dialog', { name: msg.habits.editor.newHeading }).getByTestId('habit-reminders')
    const header = reminders.getByTestId('fold-header')
    const plain = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
    await header.click()
    await expect.poll(() => header.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(plain)

    await open(page, '/account')
    const settings = page.getByTestId('account-group-settings')
    const outer = await settings.getByTestId('fold-header').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const inner = page.getByTestId('account-group-reminders').getByTestId('fold-header')
    await page.getByTestId('account-group-reminders').evaluate((el) => ((el as HTMLDetailsElement).open = false))
    expect(await inner.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(outer)
    await expect.poll(() => inner.locator('svg').evaluate((el) => getComputedStyle(el).rotate)).not.toBe('180deg')
  })
})

