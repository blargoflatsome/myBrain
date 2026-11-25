// SPEC §6 Web Push: notifications on this device. One push subscription per device, kept as a push_subscriptions row
// so the server knows where to send. The browser and the row sit behind an adapter, so tests use a fake.
import { isPushEndpoint } from '@/notifications/pushEndpoints'
import { isInstalled, isIOS } from '@/ui/device'
import { ServerError, type ServerReason } from '@/server/server'

/** A browser push subscription's address and keys (PushSubscription.toJSON). */
export interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushAdapter {
  /** Whether this browser can get push at all; 'install' on an iPhone that hasn't added the app to its Home Screen. */
  support(): 'yes' | 'install' | 'no'
  /** This device's subscription, if it has one. */
  current(): Promise<PushSub | null>
  /** Asks to show notifications (the browser's own prompt the first time). */
  askPermission(): Promise<NotificationPermission>
  subscribe(): Promise<PushSub>
  unsubscribe(): Promise<void>
  /** Saves or removes the server's row for this device; throws a ServerError when it doesn't go through. */
  saveRow(sub: PushSub): Promise<void>
  removeRow(endpoint: string): Promise<void>
  /** Shows a notification on this device now. */
  show(title: string, body: string): Promise<void>
}

/** Why push couldn't be turned on. */
export type PushRefusal = 'unsupported' | 'install' | 'blocked' | ServerReason

/** Is push on for this device? */
export async function isPushOn(): Promise<boolean> {
  return adapter.support() === 'yes' && !!(await adapter.current())
}

/**
 * Turn push on for this device: ask permission, subscribe, and save the row. Returns null when it's on, or why not;
 * anything half done is undone, so the device is never subscribed without the server knowing.
 */
export async function turnPushOn(): Promise<PushRefusal | null> {
  const support = adapter.support()
  if (support !== 'yes') return support === 'install' ? 'install' : 'unsupported'
  if ((await adapter.askPermission()) !== 'granted') return 'blocked'
  const sub = await adapter.subscribe()
  // Only real browser push services are kept (SPEC §8); the sender refuses anything else anyway.
  if (!isPushEndpoint(sub.endpoint)) {
    await adapter.unsubscribe()
    return 'unsupported'
  }
  try {
    await adapter.saveRow(sub)
  } catch (err) {
    console.error(err)
    await adapter.unsubscribe()
    return err instanceof ServerError ? err.reason : 'failed'
  }
  return null
}

/**
 * Turn push off for this device. The device stops getting them even offline: if the row can't be removed now, the
 * sender drops it the first time the push service says the subscription is gone.
 */
export async function turnPushOff(): Promise<void> {
  const sub = await adapter.current()
  if (!sub) return
  await adapter.removeRow(sub.endpoint).catch((err: unknown) => console.error(err))
  await adapter.unsubscribe()
}

/** "Send a test": shows one on this device, when push is on here. */
export async function sendTestPush(title: string, body: string): Promise<void> {
  if (await isPushOn()) await adapter.show(title, body)
}

// ---------- The browser and Supabase ----------
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function base64UrlToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const registration = () => navigator.serviceWorker.ready
const offline = () => typeof navigator !== 'undefined' && !navigator.onLine
// Supabase is loaded on first use, so unit tests with a fake never need its keys.
const client = async () => (await import('@/lib/supabase')).supabase
async function rowCall(what: string, run: () => PromiseLike<{ error: { message: string } | null }>) {
  if (offline()) throw new ServerError('offline', `${what}: offline`)
  const { error } = await run()
  if (error) throw new ServerError(offline() ? 'offline' : 'failed', `${what}: ${error.message}`)
}

const browserPush: PushAdapter = {
  support() {
    const can = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID
    if (can) return 'yes'
    return isIOS() && !isInstalled() ? 'install' : 'no'
  },
  async current() {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? (sub.toJSON() as PushSub) : null
  },
  askPermission: () => Notification.requestPermission(),
  async subscribe() {
    const sub = await (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID!) })
    return sub.toJSON() as PushSub
  },
  async unsubscribe() {
    await (await (await registration()).pushManager.getSubscription())?.unsubscribe()
  },
  async saveRow(sub) {
    const c = await client()
    await rowCall('push_subscriptions', () =>
      c.from('push_subscriptions').upsert(
        { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device_label: navigator.userAgent.slice(0, 120), last_seen: new Date().toISOString() },
        { onConflict: 'endpoint' },
      ),
    )
  },
  async removeRow(endpoint) {
    const c = await client()
    await rowCall('push_subscriptions', () => c.from('push_subscriptions').delete().eq('endpoint', endpoint))
  },
  async show(title, body) {
    await (await registration()).showNotification(title, { body, icon: '/pwa-192x192.png', data: { url: '/' } })
  },
}

let adapter: PushAdapter = browserPush

/** Use another adapter (tests); returns a function that puts the browser back. */
export function usePushAdapter(next: PushAdapter): () => void {
  adapter = next
  return () => {
    adapter = browserPush
  }
}
