// SPEC §9 TV app, Signing in by pairing: the TV's side. It asks for a code, shows it (and the /pair link for the QR
// code), and checks every few seconds until I approve it on my phone; then it keeps its device key. An unpaired TV
// keeps its old key and tries it every 30 seconds, so Undo on the phone brings it straight back.
import { serverCall, serverList } from '@/server/server'
import { readKey, writeKey } from '@/ui/storage'
import { isUnpaired } from '@/tv/screen/tvServer'

const KEY = 'my-brain:tv-device-key'
export const POLL_MS = 3_000
export const RECHECK_MS = 30_000

export interface TvCode {
  code: string
  secret: string
  expires_at: string
}
export type PollAnswer = { status: 'waiting' | 'expired'; device_key: null } | { status: 'paired'; device_key: string }

export const savedKey = () => readKey(KEY) || null
export const saveKey = (key: string) => writeKey(KEY, key)

/** A new code to show. */
export const startPairing = async () => (await serverList<TvCode>('tv_pair_start'))[0]!
/** How the code shown is doing. */
export const pollPairing = async (secret: string) => (await serverList<PollAnswer>('tv_pair_poll', { secret }))[0]!

/** Whether a key works: 'paired', 'unpaired', or 'unknown' when the server couldn't be reached (try again later). */
export async function checkKey(key: string): Promise<'paired' | 'unpaired' | 'unknown'> {
  try {
    await serverCall<boolean>('tv_check', { device_key: key })
    return 'paired'
  } catch (err) {
    return isUnpaired(err) ? 'unpaired' : 'unknown'
  }
}

/** The address the QR code opens on my phone, with the code filled in. */
export const pairUrl = (origin: string, code: string) => `${origin}/pair?code=${encodeURIComponent(code)}`

/** The code split in two for reading across a room: "ABC DEF". */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`
