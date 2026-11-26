// SPEC §9 TV app, Signing in by pairing: approving a TV's code and the Paired devices list. Everything goes through
// server functions; the server keeps only fingerprints of codes and device keys.
import { serverCall as call, serverList as list } from '@/server/server'

export interface PairedDevice {
  id: string
  name: string
  created_at: string
  last_seen_at: string | null
}

/** The code as the TV shows it: capitals, no spaces or dashes. */
export const cleanCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase()

/** True when the code paired a TV; false for a wrong or old code. */
export const pairTv = (code: string) => call<boolean>('pair_tv', { code: cleanCode(code) })
export const myPairedDevices = () => list<PairedDevice>('my_paired_devices')
/** Unpair a TV, or with `undo` put it back. */
export const unpairDevice = (device: string, undo = false) => call<void>('unpair_device', { device, undo })
