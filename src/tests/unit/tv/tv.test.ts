import { describe, expect, it } from 'vitest'
import { IDLE_AFTER_MS, isIdle } from '@/tv/screen/idle'
import { buttonOf } from '@/tv/screen/remote'
import { isUnpaired, tvServerAdapter } from '@/tv/screen/tvServer'
import { ServerError, serverCall, useServerAdapter } from '@/server/server'
import { cleanCode } from '@/tv/devices'
import { tellLauncher, type Framed } from '@/tv/screen/launcher'

const MIN = 60_000

describe('SPEC §9 TV app, Idle screen: 15 minutes with no button pressed', () => {
  it.each([
    ['just under 15 minutes after a press', 0, IDLE_AFTER_MS - 1, false, null, false],
    ['15 minutes after a press', 0, IDLE_AFTER_MS, false, null, true],
    ['while a routine or the Focus timer is open, however long', 0, 60 * MIN, true, null, false],
    ['the 15 minutes start again on leaving a routine', 0, 20 * MIN, false, 10 * MIN, false],
    ['15 minutes after leaving a routine', 0, 25 * MIN, false, 10 * MIN, true],
  ])('%s', (_what, pressedAt, now, held, heldEndedAt, idle) => {
    expect(isIdle(pressedAt, now, held, heldEndedAt)).toBe(idle)
  })
})

describe('SPEC §9 TV app, Remote control: the remote’s buttons', () => {
  it.each([
    [{ keyCode: 10009 }, 'back'],
    [{ key: 'XF86Back', keyCode: 10009 }, 'back'],
    [{ key: 'Escape' }, 'back'],
    [{ key: 'Enter', keyCode: 13 }, 'ok'],
    [{ keyCode: 38 }, 'up'],
    [{ key: 'ArrowLeft' }, 'left'],
    [{ key: 'a', keyCode: 65 }, 'other'],
  ])('%o is %s', (event, button) => {
    expect(buttonOf(event)).toBe(button)
  })
})

describe('SPEC §9 TV app, Access: the TV’s server calls', () => {
  const answer = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status })
  const callWith = async (fetcher: () => Promise<Response>) => {
    const restore = useServerAdapter(tvServerAdapter('https://x.supabase.co', 'anon', fetcher as typeof fetch))
    try {
      return await serverCall('tv_check', { device_key: 'k' })
    } finally {
      restore()
    }
  }

  it('an unpaired key is told apart from other failures, so the TV goes back to pairing', async () => {
    const err = await callWith(answer(400, { code: '28000', message: 'This TV is not paired' })).catch((e: unknown) => e)
    expect(isUnpaired(err)).toBe(true)
    const other = await callWith(answer(500, { code: 'XX000' })).catch((e: unknown) => e)
    expect(isUnpaired(other)).toBe(false)
  })

  it('a limit the server keeps is named as a limit (SPEC §7)', async () => {
    const err = await callWith(answer(400, { code: 'P0429' })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ServerError)
    expect((err as ServerError).reason).toBe('limit')
  })

  it('an answer comes back as sent; no content is nothing', async () => {
    expect(await callWith(answer(200, true))).toBe(true)
    expect(await callWith(answer(204))).toBeNull()
  })
})

describe('SPEC §9 Pairing: the code is read the way the TV shows it', () => {
  it.each([['abc def', 'ABCDEF'], ['ab-cd-ef', 'ABCDEF'], [' Q7KM2P ', 'Q7KM2P']])('%s → %s', (typed, code) => {
    expect(cleanCode(typed)).toBe(code)
  })
})

describe('SPEC §9 TV app, The launcher: the TV page tells it when it has loaded', () => {
  it('in the launcher’s frame, ready is sent to the launcher', () => {
    const sent: unknown[] = []
    tellLauncher({ myBrainTv: 'ready' }, { parent: { postMessage: (message: unknown) => sent.push(message) } })
    expect(sent).toEqual([{ myBrainTv: 'ready' }])
  })

  it('outside a frame nothing is sent', () => {
    const sent: unknown[] = []
    const page: Framed = {}
    page.parent = Object.assign(page, { postMessage: (message: unknown) => sent.push(message) })
    tellLauncher({ myBrainTv: 'ready' }, page)
    expect(sent).toEqual([])
  })
})
