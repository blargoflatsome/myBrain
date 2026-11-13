// Locking my journal (SPEC §5, §8): the journal key, how it's wrapped, and how each field is encrypted. Browser
// WebCrypto only (no WebAssembly, so the Content Security Policy stays as it is).

/** PBKDF2 rounds for the passphrase (OWASP's current advice for PBKDF2-SHA-256). The server refuses fewer. */
export const PBKDF2_ROUNDS = 600_000
const PREFIX = 'enc:v1:'
const IV_BYTES = 12
// Crockford's base 32: no I, L, O or U, so a recovery key can't be misread.
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_LENGTH = 24
const WRAP_AAD = new TextEncoder().encode('my-brain journal key v1')
const subtle = () => globalThis.crypto.subtle

/** A secret (passphrase, recovery key or passkey) that didn't open the journal key. */
export class WrongSecretError extends Error {
  constructor() {
    super('That secret does not open this journal')
    this.name = 'WrongSecretError'
  }
}

// ---------- Encoding ----------
/** Bytes as standard base64. */
export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
/** Standard base64 as bytes. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
/** Bytes as base64url (WebAuthn credential ids). */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/** Base64url as bytes. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}
/** Random bytes. */
export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}
function joined(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

// ---------- Recovery key ----------
/** A new recovery key: 24 random characters in groups of four ("K7QM-4XPA-…"). */
export function makeRecoveryKey(): string {
  // 256 is a multiple of 32, so every character is equally likely.
  const chars = [...randomBytes(RECOVERY_LENGTH)].map((b) => RECOVERY_ALPHABET[b % 32]!)
  return chars.join('').match(/.{4}/g)!.join('-')
}
/** A typed recovery key in its stored form: capitals, no spaces or dashes, and look-alike letters read as digits. */
export function normalizeRecoveryKey(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
}

// ---------- Wrapping keys ----------
async function aesKey(raw: Uint8Array<ArrayBuffer>, extractable: boolean): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'])
}

/** The key my passphrase makes (PBKDF2-SHA-256). */
export async function passphraseKey(passphrase: string, saltB64: string, rounds: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** A key from high-entropy input (a recovery key, a passkey's PRF output), through HKDF-SHA-256. */
async function hkdfKey(input: Uint8Array<ArrayBuffer>, saltB64: string, info: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', input, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: fromBase64(saltB64), info: new TextEncoder().encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
/** The key a recovery key makes. */
export function recoveryKeyKey(recovery: string, saltB64: string): Promise<CryptoKey> {
  return hkdfKey(new TextEncoder().encode(normalizeRecoveryKey(recovery)), saltB64, 'my-brain recovery v1')
}
/** The key a passkey's PRF output makes. */
export function passkeyKey(prfOutput: ArrayBuffer, saltB64: string): Promise<CryptoKey> {
  return hkdfKey(new Uint8Array(prfOutput), saltB64, 'my-brain passkey v1')
}

/** The journal key's bytes, locked by another key: base64(iv ‖ ciphertext ‖ tag). */
export async function wrapJournalKey(wrapping: CryptoKey, raw: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: WRAP_AAD }, wrapping, raw)
  return toBase64(joined(iv, new Uint8Array(sealed)))
}
/** The journal key's bytes, or WrongSecretError when this key doesn't open it. */
export async function unwrapJournalKey(wrapping: CryptoKey, wrapped: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64(wrapped)
  try {
    const raw = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: WRAP_AAD }, wrapping, bytes.slice(IV_BYTES))
    return new Uint8Array(raw)
  } catch {
    throw new WrongSecretError()
  }
}

/** The journal key as this device keeps it: usable, never readable (non-exportable). */
export function deviceKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return aesKey(raw, false)
}

// ---------- Setting up and opening ----------
/** The wrapped-key fields of a journal_keys row (no imports, so browser tests can use this module directly). */
interface KeyFields {
  version: number
  kdf_salt: string
  kdf_iterations: number
  key_by_passphrase: string
  recovery_salt: string
  key_by_recovery: string
}

/** A new journal key, wrapped by the passphrase and a new recovery key. */
export async function newJournalLock(passphrase: string, rounds = PBKDF2_ROUNDS): Promise<{ raw: Uint8Array<ArrayBuffer>; fields: KeyFields; recoveryKey: string }> {
  const raw = randomBytes(32)
  const pass = await passphraseFields(raw, passphrase, rounds)
  const { recoveryKey, ...rec } = await recoveryFields(raw)
  return { raw, recoveryKey, fields: { version: 1, ...pass, ...rec } }
}
/** The passphrase part of a journal_keys row, with a fresh salt. */
export async function passphraseFields(raw: Uint8Array<ArrayBuffer>, passphrase: string, rounds = PBKDF2_ROUNDS) {
  const kdf_salt = toBase64(randomBytes(16))
  return { kdf_salt, kdf_iterations: rounds, key_by_passphrase: await wrapJournalKey(await passphraseKey(passphrase, kdf_salt, rounds), raw) }
}
/** The recovery part of a journal_keys row, with a new recovery key to show once. */
export async function recoveryFields(raw: Uint8Array<ArrayBuffer>) {
  const recoveryKey = makeRecoveryKey()
  const recovery_salt = toBase64(randomBytes(16))
  return { recoveryKey, recovery_salt, key_by_recovery: await wrapJournalKey(await recoveryKeyKey(recoveryKey, recovery_salt), raw) }
}
/** The journal key's bytes from my passphrase. */
export async function openWithPassphrase(row: KeyFields, passphrase: string): Promise<Uint8Array<ArrayBuffer>> {
  return unwrapJournalKey(await passphraseKey(passphrase, row.kdf_salt, row.kdf_iterations), row.key_by_passphrase)
}
/** The journal key's bytes from my recovery key. */
export async function openWithRecoveryKey(row: KeyFields, recovery: string): Promise<Uint8Array<ArrayBuffer>> {
  return unwrapJournalKey(await recoveryKeyKey(recovery, row.recovery_salt), row.key_by_recovery)
}

// ---------- Fields ----------
/** Where a field belongs, bound into its encryption so it can't be moved to another entry or field. */
export interface FieldPlace {
  userId: string
  entryId: string
  field: 'body' | 'tomorrow'
}
const placeBytes = (p: FieldPlace) => new TextEncoder().encode(`${p.userId}|${p.entryId}|${p.field}`)

/** True when a stored value is encrypted. */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX)
}
/** A field to store: encrypted, or left alone when empty or already encrypted. */
export async function encryptField(key: CryptoKey, text: string, place: FieldPlace): Promise<string> {
  if (!text || isEncrypted(text)) return text
  const iv = randomBytes(IV_BYTES)
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: placeBytes(place) }, key, new TextEncoder().encode(text))
  return PREFIX + toBase64(joined(iv, new Uint8Array(sealed)))
}
/** A field as written; plain values are returned as they are. Throws when it can't be opened. */
export async function decryptField(key: CryptoKey, stored: string, place: FieldPlace): Promise<string> {
  if (!isEncrypted(stored)) return stored
  const bytes = fromBase64(stored.slice(PREFIX.length))
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: placeBytes(place) }, key, bytes.slice(IV_BYTES))
  return new TextDecoder().decode(plain)
}
