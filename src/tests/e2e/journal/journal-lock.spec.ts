import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase, TEST_USER_ID } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'
import { deviceKey, encryptField, newJournalLock } from '../../../journal/crypto'

// New York, Tue Nov 10 2026, 8:00 pm.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z')
const PASS = 'a long journal passphrase'
const SECRET_WORDS = 'Past you met a fox at the bakery'
const m = msg.journalLock

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

/** A journal locked on another device: its key row and one encrypted entry from yesterday (fewer rounds, for speed). */
async function seedLockedJournal() {
  const lock = await newJournalLock(PASS, 1000)
  server.seed('journal_keys', [{ id: 'key-1', ...lock.fields }])
  const key = await deviceKey(lock.raw)
  const body = await encryptField(key, `<p>${SECRET_WORDS}</p>`, { userId: TEST_USER_ID, entryId: 'j9', field: 'body' })
  server.seed('journal_entries', [{ id: 'j9', date: '2026-11-09', body, stats: {}, stats_final: true, auto: false, word_count: 8, has_writing: true }])
  return lock
}

async function lockFromAccount(page: Page) {
  await page.goto('/account')
  await page.getByTestId('journal-lock-on').click()
  const dialog = page.getByTestId('journal-lock-dialog')
  await dialog.getByTestId('new-passphrase').fill(PASS)
  // The second box says as I type whether the two match, before I go on.
  await dialog.getByTestId('repeat-passphrase').fill(PASS.slice(0, 5))
  await expect(dialog.getByTestId('passphrase-match')).toHaveAttribute('data-match', 'false')
  await dialog.getByTestId('repeat-passphrase').fill(PASS)
  await expect(dialog.getByTestId('passphrase-match')).toHaveAttribute('data-match', 'true')
  await dialog.getByTestId('show-passphrase').check()
  await expect(dialog.getByTestId('new-passphrase')).toHaveAttribute('type', 'text')
  await dialog.getByTestId('passphrase-next').click()
  await expect(dialog.getByTestId('recovery-key')).toHaveText(/[0-9A-Z]{4}(-[0-9A-Z]{4}){5}/)
  // The recovery key is shown once: I must say I saved it before going on.
  await expect(dialog.getByTestId('recovery-next')).toBeDisabled()
  await dialog.getByTestId('saved-recovery').check()
  await dialog.getByTestId('recovery-next').click()
  return dialog
}

/** Forget this device's unlocked key, as a new device (or signing in again) would be. */
async function forgetDeviceKey(page: Page) {
  await page.evaluate(async (uid) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(`my-brain-${uid}`)
      req.onsuccess = () => {
        const tx = req.result.transaction('secrets', 'readwrite')
        tx.objectStore('secrets').delete('journal')
        tx.oncomplete = () => (req.result.close(), resolve())
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, TEST_USER_ID)
}

test.describe('SPEC §5 Locking my journal', () => {
  test('turned on from Account, my writing goes to the server encrypted and never as plain text', async ({ page }) => {
    await page.clock.install({ time: NOW })
    const dialog = await lockFromAccount(page)
    await dialog.getByRole('button', { name: m.skip }).click()
    await expect(page.getByTestId('journal-lock')).toContainText(m.hintOn)
    expect(server.written('journal_keys')).toHaveLength(1)

    await page.goto('/journal')
    await page.getByRole('textbox', { name: msg.journal.writeLabel }).click()
    await page.keyboard.type(SECRET_WORDS)
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect(page.getByTestId('journal-today').getByTestId('save-status')).toHaveText(msg.journal.saved)

    const uploads = server.written('journal_entries')
    expect(uploads.length).toBeGreaterThan(0)
    expect(JSON.stringify(uploads)).not.toContain('fox')
    expect(uploads.at(-1)).toMatchObject({ body: expect.stringMatching(/^enc:v1:/), word_count: 8, has_writing: true })
  })

  test('a new device offers no editor until it has downloaded the lock', async ({ page }) => {
    await seedLockedJournal()
    // Hold the lock's download (a later route is tried first, then falls through to the fake server).
    let release = () => {}
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/rest/v1/journal_keys*', async (route) => {
      await held
      await route.fallback()
    })
    await page.clock.install({ time: NOW })
    await page.goto('/journal')
    await expect(page.getByTestId('journal-lock-checking')).toBeVisible()
    await expect(page.getByRole('textbox', { name: msg.journal.writeLabel })).toHaveCount(0)
    release()
    await expect(page.getByTestId('journal-locked')).toBeVisible()
  })

  test('a new device shows stats but not the writing until unlocked; a wrong passphrase is refused', async ({ page }) => {
    await seedLockedJournal()
    await page.clock.install({ time: NOW })
    await page.goto('/journal')
    const locked = page.getByTestId('journal-locked')
    await expect(locked).toBeVisible()
    await expect(page.getByRole('textbox', { name: msg.journal.writeLabel })).toHaveCount(0)
    await expect(page.getByTestId('journal-entry-2026-11-09')).toBeVisible()
    await expect(page.getByText(SECRET_WORDS)).toHaveCount(0)

    // Search can't look inside a locked journal, and says so.
    await page.getByRole('button', { name: /Search/ }).first().click()
    await page.getByRole('searchbox').fill('fox')
    await expect(page.getByTestId('search-journal-locked')).toBeVisible()
    await page.getByTestId('search-dialog').getByTestId('close-x').click()

    await locked.getByTestId('unlock-secret').fill('not the passphrase')
    await locked.getByTestId('unlock-submit').click()
    await expect(locked.getByRole('alert')).toHaveText(m.wrong)
    await locked.getByTestId('unlock-secret').fill(PASS)
    await locked.getByTestId('unlock-submit').click()
    await expect(page.getByTestId('journal-entry-2026-11-09').getByTestId('journal-body')).toHaveText(SECRET_WORDS)
    await expect(page.getByRole('textbox', { name: msg.journal.writeLabel })).toBeVisible()
  })

  test('the recovery key unlocks it too', async ({ page }) => {
    const lock = await seedLockedJournal()
    await page.clock.install({ time: NOW })
    await page.goto('/journal')
    const locked = page.getByTestId('journal-locked')
    await locked.getByRole('button', { name: m.useRecovery }).click()
    await locked.getByTestId('unlock-secret').fill(lock.recoveryKey.toLowerCase())
    await locked.getByTestId('unlock-submit').click()
    await expect(page.getByTestId('journal-entry-2026-11-09').getByTestId('journal-body')).toHaveText(SECRET_WORDS)
  })

  test('Start my journal over deletes the writing everywhere and locks it again', async ({ page }) => {
    await seedLockedJournal()
    await page.clock.install({ time: NOW })
    await page.goto('/account')
    await page.getByTestId('journal-start-over').click()
    const confirm = page.getByRole('dialog', { name: m.startOverHeading })
    await confirm.getByLabel(m.typeLabel).fill(m.word)
    await confirm.getByRole('button', { name: m.startOverConfirm }).click()
    const dialog = page.getByTestId('journal-lock-dialog')
    await dialog.getByTestId('new-passphrase').fill('another long passphrase')
    await dialog.getByTestId('repeat-passphrase').fill('another long passphrase')
    await dialog.getByTestId('passphrase-next').click()
    await expect(dialog.getByTestId('recovery-key')).toBeVisible()

    await expect.poll(() => server.tables.journal_entries!.get('j9')?.body).toBe('')
    expect(server.tables.journal_entries!.get('j9')).toMatchObject({ word_count: 8, has_writing: true })
    expect(server.tables.journal_keys!.get('key-1')?.deleted_at).toBeTruthy()
    expect([...server.tables.journal_keys!.values()].filter((k) => !k.deleted_at)).toHaveLength(1)
  })

  test('turning it off needs the passphrase and uploads the writing readable again', async ({ page }) => {
    await seedLockedJournal()
    await page.clock.install({ time: NOW })
    await page.goto('/journal')
    await page.getByTestId('journal-locked').getByTestId('unlock-secret').fill(PASS)
    await page.getByTestId('journal-locked').getByTestId('unlock-submit').click()
    await expect(page.getByTestId('journal-entry-2026-11-09').getByTestId('journal-body')).toBeVisible()

    await page.goto('/account')
    await page.getByTestId('journal-lock-off').click()
    const dialog = page.getByTestId('journal-lock-dialog')
    await dialog.getByTestId('unlock-secret').fill(PASS)
    await dialog.getByTestId('unlock-submit').click()
    await dialog.getByTestId('turn-off-confirm').click()
    await expect(page.getByTestId('journal-lock')).toContainText(m.hintOff)
    await expect.poll(() => server.tables.journal_entries!.get('j9')?.body).toBe(`<p>${SECRET_WORDS}</p>`)
  })

  test('Download my data asks to unlock first; Skip saves the writing still encrypted', async ({ page }) => {
    await seedLockedJournal()
    await page.goto('/account')
    await expect(page.getByTestId('journal-lock')).toContainText(m.hintOn)
    await page.getByRole('button', { name: msg.dataExport.button }).click()
    const ask = page.getByTestId('export-unlock')
    await expect(ask).toBeVisible()
    const download = page.waitForEvent('download')
    await ask.getByTestId('export-skip').click()
    const file = JSON.parse(await (await (await download).createReadStream()).toArray().then((c) => Buffer.concat(c).toString())) as { journal_note?: string; tables: { journal_entries: { body: string }[] } }
    expect(file.journal_note).toBeTruthy()
    expect(file.tables.journal_entries[0]!.body).toMatch(/^enc:v1:/)
  })

  test('a passkey added at setup unlocks the journal on a device that forgot its key', async ({ page }) => {
    // Chromium's built-in stand-in for a passkey device, with PRF (the WebAuthn extension the lock uses).
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    })
    await page.clock.install({ time: NOW })
    const dialog = await lockFromAccount(page)
    await dialog.getByTestId('passkey-add').click()
    await expect(dialog.getByRole('status')).toHaveText(m.passkeyAdded)
    await dialog.getByRole('button', { name: m.done }).click()
    await expect(page.getByTestId('journal-passkeys')).toContainText(m.passkeyNameDefault)

    await page.goto('/journal')
    await page.getByRole('textbox', { name: msg.journal.writeLabel }).click()
    await page.keyboard.type(SECRET_WORDS)
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect(page.getByTestId('journal-today').getByTestId('save-status')).toHaveText(msg.journal.saved)

    await forgetDeviceKey(page)
    await page.reload()
    const locked = page.getByTestId('journal-locked')
    await expect(locked).toBeVisible()
    await locked.getByTestId('unlock-passkey').click()
    await expect(page.getByRole('textbox', { name: msg.journal.writeLabel })).toContainText(SECRET_WORDS)
  })
})
