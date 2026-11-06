// Sends Web Push notifications (SPEC §6). Called only by Supabase Cron when a reminder is due, with a shared secret.
// It never reads the database: the job sends the subscriptions and the message, and gets back the ones that are gone.
import webpush from 'web-push'

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
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('Forbidden', { status: 403 })

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return new Response('Push is not configured', { status: 500 })
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!Array.isArray(body.subscriptions) || !body.payload) return new Response('Bad request', { status: 400 })

  const message = JSON.stringify(body.payload)
  const gone: string[] = []
  let sent = 0
  await Promise.all(
    body.subscriptions.map(async (s) => {
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

export const config = { path: '/api/send-push' }
