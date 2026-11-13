// @vitest-environment node
// WebCrypto needs Node's own typed arrays; jsdom's are from another realm and WebCrypto refuses them.
import { describe, expect, it } from 'vitest'
import {
  decryptField,
  deviceKey,
  encryptField,
  isEncrypted,
  makeRecoveryKey,
  newJournalLock,
  normalizeRecoveryKey,
  openWithPassphrase,
  openWithRecoveryKey,
  passkeyKey,
  passphraseFields,
  randomBytes,
  unwrapJournalKey,
  wrapJournalKey,
  toBase64,
  WrongSecretError,
} from '@/journal/crypto'

// Fewer PBKDF2 rounds than the app uses, so the suite stays quick; the rule is the same.
const ROUNDS = 1000
const place = { userId: 'user-1', entryId: 'entry-1', field: 'body' as const }
const LONG = {
  sentence: '<p>Past you wrote a very long sentence about the day that keeps going and going without stopping for breath at all.</p>',
  paragraph: `<p>${'A whole paragraph of feelings, with emoji 🌧️ and accents café. '.repeat(400)}</p>`,
  link: `<p>https://example.com/${'x'.repeat(5000)}</p>`,
}

async function key() {
  return deviceKey(randomBytes(32))
}

describe('SPEC §5 Locking my journal: each field is encrypted', () => {
  it.each(Object.entries(LONG))('a %s comes back exactly as written', async (_name, text) => {
    const k = await key()
    const stored = await encryptField(k, text, place)
    expect(isEncrypted(stored)).toBe(true)
    expect(stored).not.toContain('Past you')
    expect(await decryptField(k, stored, place)).toBe(text)
  })

  it('leaves empty and already-encrypted fields alone, so app-written entries need no key', async () => {
    const k = await key()
    expect(await encryptField(k, '', place)).toBe('')
    const once = await encryptField(k, '<p>hi</p>', place)
    expect(await encryptField(k, once, place)).toBe(once)
  })

  it('fails to open with the wrong key, a changed byte, or in another entry or field', async () => {
    const k = await key()
    const stored = await encryptField(k, '<p>secret</p>', place)
    // A character in the middle (the last ones can be base64 padding bits that change nothing).
    const at = Math.floor(stored.length / 2)
    const flipped = stored.slice(0, at) + (stored[at] === 'A' ? 'B' : 'A') + stored.slice(at + 1)
    await expect(decryptField(await key(), stored, place)).rejects.toThrow()
    await expect(decryptField(k, flipped, place)).rejects.toThrow()
    await expect(decryptField(k, stored, { ...place, entryId: 'entry-2' })).rejects.toThrow()
    await expect(decryptField(k, stored, { ...place, field: 'tomorrow' })).rejects.toThrow()
  })
})

describe('SPEC §5 Locking my journal: the journal key opens with the passphrase, recovery key or a passkey', () => {
  it('opens with the passphrase and with the recovery key, and not with a wrong one', async () => {
    const lock = await newJournalLock('correct horse battery staple', ROUNDS)
    expect(await openWithPassphrase(lock.fields, 'correct horse battery staple')).toEqual(lock.raw)
    expect(await openWithRecoveryKey(lock.fields, lock.recoveryKey)).toEqual(lock.raw)
    await expect(openWithPassphrase(lock.fields, 'wrong horse')).rejects.toBeInstanceOf(WrongSecretError)
    await expect(openWithRecoveryKey(lock.fields, makeRecoveryKey())).rejects.toBeInstanceOf(WrongSecretError)
  })

  it('accepts a recovery key typed in lower case, with spaces, or with O and I for 0 and 1', async () => {
    const lock = await newJournalLock('a passphrase here', ROUNDS)
    const typed = lock.recoveryKey.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'i')
    expect(await openWithRecoveryKey(lock.fields, typed)).toEqual(lock.raw)
    expect(normalizeRecoveryKey(lock.recoveryKey)).toHaveLength(24)
  })

  it('opens with a passkey PRF output only when it is the same output', async () => {
    const raw = randomBytes(32)
    const salt = toBase64(randomBytes(16))
    const prf = randomBytes(32).buffer
    const wrapped = await wrapJournalKey(await passkeyKey(prf, salt), raw)
    expect(await unwrapJournalKey(await passkeyKey(prf, salt), wrapped)).toEqual(raw)
    await expect(unwrapJournalKey(await passkeyKey(randomBytes(32).buffer, salt), wrapped)).rejects.toBeInstanceOf(WrongSecretError)
  })

  it('a new passphrase opens the same journal key, so entries never need re-encrypting', async () => {
    const lock = await newJournalLock('first passphrase', ROUNDS)
    const k = await deviceKey(lock.raw)
    const stored = await encryptField(k, '<p>kept</p>', place)
    const changed = { ...lock.fields, ...(await passphraseFields(lock.raw, 'second passphrase', ROUNDS)) }
    const reopened = await deviceKey(await openWithPassphrase(changed, 'second passphrase'))
    expect(await decryptField(reopened, stored, place)).toBe('<p>kept</p>')
    await expect(openWithPassphrase(changed, 'first passphrase')).rejects.toBeInstanceOf(WrongSecretError)
    expect(await openWithRecoveryKey(changed, lock.recoveryKey)).toEqual(lock.raw)
  })

  it('keeps the device copy non-exportable', async () => {
    const k = await deviceKey(randomBytes(32))
    expect(k.extractable).toBe(false)
  })
})
