// SPEC §9 TV app, Access: the TV never signs in. It calls only the tv_* server functions, with its device key, over
// plain fetch (supabase-js isn't loaded on the TV's older engine). Installed as the server seam's adapter, so the TV
// uses serverCall and sayWhy like every other screen.
import { LIMIT_CODE, ServerError, type ServerAdapter, type ServerReason } from '@/server/server'

/** The server's answer when a device key doesn't work (unpaired, or never paired). */
export const UNPAIRED_CODE = '28000'

/** True when a call failed because this TV isn't paired (any more). */
export const isUnpaired = (err: unknown) => err instanceof ServerError && err.code === UNPAIRED_CODE

/** An adapter that posts to Supabase's REST endpoint for server functions with the public (anon) key. */
export function tvServerAdapter(url: string, anonKey: string, fetcher: typeof fetch = (...a) => fetch(...a)): ServerAdapter {
  const online = () => typeof navigator === 'undefined' || navigator.onLine
  return {
    online,
    async call(fn, args) {
      const res = await fetcher(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (res.status === 204) return null
      const body: unknown = await res.json().catch(() => null)
      if (res.ok) return body
      const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : undefined
      const reason: ServerReason = code === LIMIT_CODE ? 'limit' : online() ? 'failed' : 'offline'
      throw new ServerError(reason, `${fn}: ${res.status}`, code)
    },
  }
}
