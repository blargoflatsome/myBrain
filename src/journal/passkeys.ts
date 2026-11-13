// Locking my journal (SPEC §5): passkeys that unlock it, through WebAuthn's PRF extension. A passkey here only
// unlocks the journal; it never signs in, so nothing is checked on the server: only the passkey's device can
// produce the PRF output that opens the journal key.
import { fromBase64, fromBase64Url, randomBytes, toBase64Url } from '@/journal/crypto'

/** The browser or authenticator can't give a PRF output, so this passkey can't unlock the journal. */
export class NoPrfError extends Error {
  constructor() {
    super('This passkey has no PRF support')
    this.name = 'NoPrfError'
  }
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: BufferSource } } }

/** True when this browser has passkeys at all (PRF support is only known once one is tried). */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials
}

function prfOutput(cred: PublicKeyCredential): ArrayBuffer | null {
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!first) return null
  if (first instanceof ArrayBuffer) return first
  const view = first as ArrayBufferView
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer
}

/**
 * A new passkey for this site, with its PRF output for `salt`. Some browsers only give PRF output when the passkey
 * is used, not when it's made, so it's used once straight away in that case.
 */
export async function createJournalPasskey(user: { id: string; name: string }, rpName: string, saltB64: string): Promise<{ credentialId: string; prf: ArrayBuffer }> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: rpName },
      user: { id: new TextEncoder().encode(user.id), name: user.name, displayName: user.name },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf: { eval: { first: fromBase64(saltB64) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new DOMException('Cancelled', 'NotAllowedError')
  const credentialId = toBase64Url(new Uint8Array(cred.rawId))
  const made = prfOutput(cred)
  if (made) return { credentialId, prf: made }
  if (!(cred.getClientExtensionResults() as PrfResults).prf?.enabled) throw new NoPrfError()
  return askJournalPasskey([{ credential_id: credentialId, prf_salt: saltB64 }])
}

/** Use one of my passkeys: which one, and its PRF output for its salt. */
export async function askJournalPasskey(keys: { credential_id: string; prf_salt: string }[]): Promise<{ credentialId: string; prf: ArrayBuffer }> {
  const evalByCredential = Object.fromEntries(keys.map((k) => [k.credential_id, { first: fromBase64(k.prf_salt) }]))
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: keys.map((k) => ({ type: 'public-key' as const, id: fromBase64Url(k.credential_id) })),
      userVerification: 'required',
      extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new DOMException('Cancelled', 'NotAllowedError')
  const prf = prfOutput(cred)
  if (!prf) throw new NoPrfError()
  return { credentialId: toBase64Url(new Uint8Array(cred.rawId)), prf }
}
