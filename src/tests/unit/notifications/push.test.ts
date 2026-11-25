import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isPushOn, sendTestPush, turnPushOff, turnPushOn, usePushAdapter, type PushAdapter, type PushSub } from '@/notifications/push'
import { ServerError, type ServerReason } from '@/server/server'

/** A browser and server row in memory: what this device is subscribed to, and the rows the server keeps. */
class FakePush implements PushAdapter {
  can: 'yes' | 'install' | 'no' = 'yes'
  permission: NotificationPermission = 'granted'
  endpoint = 'https://fcm.googleapis.com/fcm/send/abc'
  sub: PushSub | null = null
  rows = new Set<string>()
  failRows: ServerReason | null = null
  shown: string[] = []
  support() {
    return this.can
  }
  async current() {
    return this.sub
  }
  async askPermission() {
    return this.permission
  }
  async subscribe() {
    this.sub = { endpoint: this.endpoint, keys: { p256dh: 'k', auth: 'a' } }
    return this.sub
  }
  async unsubscribe() {
    this.sub = null
  }
  async saveRow(sub: PushSub) {
    if (this.failRows) throw new ServerError(this.failRows)
    this.rows.add(sub.endpoint)
  }
  async removeRow(endpoint: string) {
    if (this.failRows) throw new ServerError(this.failRows)
    this.rows.delete(endpoint)
  }
  async show(title: string) {
    this.shown.push(title)
  }
}

let push: FakePush
let restore: () => void
beforeEach(() => {
  push = new FakePush()
  restore = usePushAdapter(push)
})
afterEach(() => restore())

describe('SPEC §6 Web Push: one subscription per device, known to the server', () => {
  it('turning it on subscribes this device and saves its row', async () => {
    expect(await turnPushOn()).toBeNull()
    expect(await isPushOn()).toBe(true)
    expect([...push.rows]).toEqual([push.endpoint])
  })

  it.each([
    { why: 'install', setup: (p: FakePush) => (p.can = 'install') },
    { why: 'unsupported', setup: (p: FakePush) => (p.can = 'no') },
    { why: 'blocked', setup: (p: FakePush) => (p.permission = 'denied') },
    { why: 'unsupported', setup: (p: FakePush) => (p.endpoint = 'https://169.254.169.254/latest') },
    { why: 'offline', setup: (p: FakePush) => (p.failRows = 'offline') },
    { why: 'failed', setup: (p: FakePush) => (p.failRows = 'failed') },
  ])('refused ($why): says why and leaves the device unsubscribed', async ({ why, setup }) => {
    setup(push)
    expect(await turnPushOn()).toBe(why)
    expect(push.sub).toBeNull()
    expect(push.rows.size).toBe(0)
  })

  it('turning it off removes the row and the subscription', async () => {
    await turnPushOn()
    await turnPushOff()
    expect(push.sub).toBeNull()
    expect(push.rows.size).toBe(0)
  })

  it('turning it off offline still stops it on this device (the sender drops the row later)', async () => {
    await turnPushOn()
    push.failRows = 'offline'
    await turnPushOff()
    expect(push.sub).toBeNull()
  })

  it('Send a test shows one only when it is on here', async () => {
    await sendTestPush('Test', 'body')
    await turnPushOn()
    await sendTestPush('Test', 'body')
    expect(push.shown).toEqual(['Test'])
  })
})
