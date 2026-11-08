// What other apps share into My Brain (SPEC §3 PWA, §5 Calendar "Sharing a contact"). The share target receives a
// POST so it can take contact files; the service worker answers it: a contact file waits on the device for the
// invite screen, and text or a link goes to Capture as before.
// The service worker builds this file too, so it imports nothing from the app.
/** Largest contact file read (a few hundred contacts without photos). */
export const MAX_SHARED_BYTES = 1024 * 1024

export const SHARE_PATH = '/share'
export const INVITE_CONTACT_PATH = '/invite-contact'
/** Where a shared contact file waits (Cache Storage, so the service worker and the page can both reach it). */
export const SHARE_CACHE = 'my-brain-share'
export const SHARED_CONTACTS_KEY = '/shared-contacts'
const SHARED_AT_HEADER = 'x-shared-at'
/** Shared contacts not picked up within an hour are dropped. */
export const KEEP_SHARED_MS = 60 * 60 * 1000
const MAX_TEXT = 20000

/** Read a share and say where to go next; `keep` stores a contact file's text for the invite screen. */
export async function routeShare(form: FormData, keep: (text: string) => Promise<void>): Promise<string> {
  const files = form.getAll('contacts').filter((f): f is File => typeof f === 'object' && f !== null && f.size > 0)
  if (files.length) {
    let text = ''
    for (const file of files) {
      const room = MAX_SHARED_BYTES - text.length
      if (room <= 0) break
      text += (await new Response(file.slice(0, room)).text()) + '\n'
    }
    await keep(text)
    return INVITE_CONTACT_PATH
  }
  const query = new URLSearchParams()
  for (const key of ['title', 'text', 'url']) {
    const value = form.get(key)
    if (typeof value === 'string' && value.trim()) query.set(key, value.slice(0, MAX_TEXT))
  }
  const search = query.toString()
  return search ? `/capture?${search}` : '/capture'
}

/** Keep a shared contact file on the device until the invite screen takes it. */
export async function keepSharedContacts(text: string, now = Date.now()) {
  const cache = await caches.open(SHARE_CACHE)
  await cache.put(SHARED_CONTACTS_KEY, new Response(text, { headers: { 'content-type': 'text/plain', [SHARED_AT_HEADER]: String(now) } }))
}

/** Take the shared contact file, once (it is removed as it's read); null if none, or if it's over an hour old. */
export async function takeSharedContacts(now = Date.now()): Promise<string | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(SHARE_CACHE)
  const saved = await cache.match(SHARED_CONTACTS_KEY)
  if (!saved) return null
  await cache.delete(SHARED_CONTACTS_KEY)
  const at = Number(saved.headers.get(SHARED_AT_HEADER) ?? 0)
  if (!at || now - at > KEEP_SHARED_MS) return null
  return saved.text()
}
