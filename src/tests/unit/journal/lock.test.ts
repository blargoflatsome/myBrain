import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { isEncrypted, WrongSecretError } from '@/journal/crypto'

const PASS = 'a long journal passphrase'
const DAY = '2026-11-10'
const WRITING = '<p>Past you had a secret day</p>'
let remote: FakeRemote
let uid: string

beforeEach(() => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  uid = `u-${crypto.randomUUID()}`
})

afterEach(async () => {
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

/** Upload everything waiting, then download everything new. */
async function settle() {
  await useBrainStore().refresh(['journal_keys', 'journal_passkeys', 'journal_entries'])
}
const onServer = () => [...remote.tables.journal_entries.values()].find((e) => e.date === DAY)!
const onDevice = async () => (await useBrainStore().db!.journal_entries.where('date').equals(DAY).toArray())[0]!

/** Sign out and in again: the device's copy (and its key) is gone, as on a new device. */
async function freshDevice() {
  const brain = useBrainStore()
  await brain.forgetDevice()
  brain.start(uid, remote)
  await settle()
}

describe('SPEC §5 Locking my journal: writing is encrypted before it leaves the device', () => {
  it('stores the readable facts at save, for trophies and reminders', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, '<p>three little words</p>')
    expect(await onDevice()).toMatchObject({ word_count: 3, has_writing: true })
  })

  it('locking re-uploads earlier writing encrypted; the device copy stays readable', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    await brain.saveJournalFields(DAY, { tomorrow: '<p>sleep more</p>' })
    await settle()
    expect(onServer().body).toBe(WRITING)

    const { recoveryKey: recovery } = await brain.lockJournal(PASS)
    await settle()
    expect(recovery).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/)
    expect(isEncrypted(onServer().body)).toBe(true)
    expect(isEncrypted(onServer().tomorrow)).toBe(true)
    expect(JSON.stringify(onServer())).not.toContain('secret')
    expect(onServer()).toMatchObject({ word_count: 6, has_writing: true })
    expect(await onDevice()).toMatchObject({ body: WRITING, tomorrow: '<p>sleep more</p>' })

    // New writing after locking goes up encrypted too.
    await brain.saveJournalBody(DAY, '<p>more secret words</p>')
    await settle()
    expect(JSON.stringify(onServer())).not.toContain('secret')
  })

  it('a new device stays locked until unlocked by passphrase or recovery key, then reads the writing', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    const { recoveryKey: recovery } = await brain.lockJournal(PASS)
    await settle()

    await freshDevice()
    expect(isEncrypted((await onDevice()).body)).toBe(true)
    await expect(brain.unlockJournal({ kind: 'passphrase', secret: 'not it at all' })).rejects.toBeInstanceOf(WrongSecretError)
    await brain.unlockJournal({ kind: 'passphrase', secret: PASS })
    expect((await onDevice()).body).toBe(WRITING)

    await freshDevice()
    await brain.unlockJournal({ kind: 'recovery', secret: recovery })
    expect((await onDevice()).body).toBe(WRITING)
  })

  it('a changed passphrase unlocks a new device; the old one no longer does', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    await brain.lockJournal(PASS)
    await brain.changeJournalPassphrase(await brain.openJournalKey({ kind: 'passphrase', secret: PASS }), 'a brand new passphrase')
    await settle()

    await freshDevice()
    await expect(brain.unlockJournal({ kind: 'passphrase', secret: PASS })).rejects.toBeInstanceOf(WrongSecretError)
    await brain.unlockJournal({ kind: 'passphrase', secret: 'a brand new passphrase' })
    expect((await onDevice()).body).toBe(WRITING)
  })

  it('turning it off uploads the writing readable again and removes the lock', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    await brain.lockJournal(PASS)
    await settle()
    await brain.unlockJournalForGood(await brain.openJournalKey({ kind: 'passphrase', secret: PASS }))
    await settle()
    expect(onServer().body).toBe(WRITING)
    expect([...remote.tables.journal_keys.values()].every((k) => k.deleted_at)).toBe(true)
  })

  it('Start my journal over deletes the writing, keeps word counts, and locks again with the new passphrase', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    await brain.lockJournal(PASS)
    await settle()

    await freshDevice()
    await brain.startJournalOver('another long passphrase')
    await settle()
    expect(await onDevice()).toMatchObject({ body: '', word_count: 6, has_writing: true })
    expect([...remote.tables.journal_keys.values()].filter((k) => !k.deleted_at)).toHaveLength(1)
    await brain.saveJournalBody(DAY, '<p>a fresh secret start</p>')
    await settle()
    expect(JSON.stringify(onServer())).not.toContain('secret')
  })
})

describe('SPEC §5 Locking my journal: Download my data', () => {
  it('decrypts the writing where this device is unlocked', async () => {
    const brain = useBrainStore()
    brain.start(uid, remote)
    await brain.saveJournalBody(DAY, WRITING)
    await brain.lockJournal(PASS)
    await settle()
    const [row] = await brain.openJournalRows([onServer()])
    expect(row!.body).toBe(WRITING)
  })
})
