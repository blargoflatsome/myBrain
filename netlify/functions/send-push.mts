// Sends Web Push notifications (SPEC §6). Called only by Supabase Cron when a reminder is due, with a shared secret.
// It never reads the database: the job sends the subscriptions and the message, and gets back the ones that are gone.
import { timingSafeEqual } from 'node:crypto'
import * as webpush from 'web-push'
import { isPushEndpoint } from '../../src/notifications/pushEndpoints'

interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

interface Body {
  subscriptions: Subscription[]
  payload: { title: string; body: string; url: string; tag: string; priority: boolean }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = process.env.PUSH_SECRET
  if (!secret || !sameSecret(req.headers.get('x-push-secret') ?? '', secret)) return new Response('Forbidden', { status: 403 })

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return new Response('Push is not configured', { status: 500 })
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!Array.isArray(body.subscriptions) || !body.payload || body.subscriptions.length > 50) return new Response('Bad request', { status: 400 })

  const message = JSON.stringify(body.payload)
  const gone: string[] = []
  let sent = 0
  await Promise.all(
    body.subscriptions.map(async (s) => {
      // Only real browser push services (docs/SPEC.md §8); anything else is dropped like a device that's gone.
      if (!isPushEndpoint(s?.endpoint)) {
        if (typeof s?.endpoint === 'string') gone.push(s.endpoint)
        return
      }
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: body.payload.priority ? 3600 : 600, urgency: body.payload.priority ? 'high' : 'normal' },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // The push service says this device no longer exists: the job removes it (SPEC §6).
        if (status === 404 || status === 410) gone.push(s.endpoint)
      }
    }),
  )
  return Response.json({ sent, gone })
}

/** Compares the shared secret in constant time, so its value can't be guessed from how long a check takes. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const config = { path: '/api/send-push' }
