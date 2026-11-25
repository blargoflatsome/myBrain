// When syncing happens while I'm signed in (SPEC §7): coming back online, coming back to the app, leaving it, a
// retry while changes wait, and a short wait after each Realtime change. The sync engine does the work.
import type { SyncEngine } from './engine'
import type { Remote, SyncTable } from './types'

/** How often queued changes are retried while the app is open (SPEC §7). */
export const RETRY_MS = 30_000
/**
 * How long a table waits after a Realtime change before downloading. Each of my own saves comes back as a change too,
 * so several saves in a row (writing in the journal) download once, not once each.
 */
export const REALTIME_WAIT_MS = 500

/** Run sync work in the background. A store closed by sign-out mid-sync is expected and ignored. */
export function background(work: Promise<unknown> | undefined) {
  work?.catch((err: unknown) => {
    if ((err as { name?: string })?.name === 'DatabaseClosedError') return
    console.error(err)
  })
}

/** Where the app hears it went online or offline, was shown or hidden, or the page is going away. */
export interface Surroundings {
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { readonly visibilityState: DocumentVisibilityState }
}

export interface SyncTriggers {
  engine: Pick<SyncEngine, 'sync' | 'flush' | 'pull' | 'getStatus'>
  remote: Pick<Remote, 'subscribe'>
  /** The browser said this device went online or offline. Told before the catch-up starts. */
  onlineChanged: (online: boolean) => void
  /** After the catch-up that coming back online starts (a first sync may have started offline). */
  caughtUp: () => Promise<void>
}

/** Start syncing at the right moments. Returns the function that stops it all. */
export function startSyncTriggers(
  { engine, remote, onlineChanged, caughtUp }: SyncTriggers,
  { window: win, document: doc }: Surroundings = { window, document },
): () => void {
  const goOnline = () => {
    onlineChanged(true)
    background(engine.sync().then(caughtUp))
  }
  const goOffline = () => {
    onlineChanged(false)
    background(engine.flush())
  }
  // Coming back to the app catches up (Realtime misses changes while a device sleeps), and leaving it uploads anything
  // queued, because a phone may stop a hidden app before it gets another chance.
  const onVisibility = () => background(doc.visibilityState === 'visible' ? engine.sync() : engine.flush())
  const onPageHide = () => background(engine.flush())
  // A dropped request (weak signal) does not fire the browser's "online" event, so queued changes are retried while
  // the app is open, instead of waiting for the next app start.
  const retry = setInterval(() => {
    if (engine.getStatus().pending > 0 && doc.visibilityState === 'visible') background(engine.sync())
  }, RETRY_MS)
  win.addEventListener('online', goOnline)
  win.addEventListener('offline', goOffline)
  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pagehide', onPageHide)
  const waiting = new Map<SyncTable, ReturnType<typeof setTimeout>>()
  const unsubscribe = remote.subscribe((table) => {
    clearTimeout(waiting.get(table))
    waiting.set(table, setTimeout(() => {
      waiting.delete(table)
      background(engine.pull([table]))
    }, REALTIME_WAIT_MS))
  })
  return () => {
    waiting.forEach((t) => clearTimeout(t))
    win.removeEventListener('online', goOnline)
    win.removeEventListener('offline', goOffline)
    doc.removeEventListener('visibilitychange', onVisibility)
    win.removeEventListener('pagehide', onPageHide)
    clearInterval(retry)
    unsubscribe()
  }
}
