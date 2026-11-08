/// <reference lib="webworker" />
// Service worker (SPEC §3, §6): offline app shell, plus Web Push notifications that open the right screen.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  priority: boolean
}

self.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? {}) as Partial<PushPayload>
  const title = data.title ?? 'My Brain'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      tag: data.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url ?? '/' },
      // Priority reminders stay on screen until I act on them (SPEC §5).
      requireInteraction: !!data.priority,
    }),
  )
})

// Tapping a notification opens My Brain straight to the right place (SPEC §5 Routines).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only ever a page of this app, whatever the notification says (docs/SPEC.md §8).
  const target = new URL((event.notification.data as { url?: string })?.url ?? '/', self.location.origin)
  const url = target.origin === self.location.origin ? target.href : `${self.location.origin}/`
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if ('focus' in w) {
          await w.navigate(url)
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
