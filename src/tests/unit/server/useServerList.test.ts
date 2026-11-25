import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { useServerList } from '@/server/useServerList'

let scope: EffectScope
beforeEach(() => {
  setActivePinia(createPinia())
  scope = effectScope()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  scope.stop()
  vi.restoreAllMocks()
})

/** A server list whose answers the test gives: a list, or a failure. */
function listOf(answers: (string[] | Error)[]) {
  const load = vi.fn(async () => {
    const next = answers.shift() ?? []
    if (next instanceof Error) throw next
    return next
  })
  return { load, list: scope.run(() => useServerList(load, [] as string[]))! }
}

describe('SPEC §7 Lists from the server', () => {
  it('loads when I’m online', async () => {
    const { list } = listOf([['Ana']])
    await vi.waitFor(() => expect(list.state.value).toBe('ready'))
    expect(list.value.value).toEqual(['Ana'])
  })

  it('opened offline, it fills in by itself when I come back online', async () => {
    const brain = useBrainStore()
    brain.online = false
    const { list, load } = listOf([['Ana']])
    expect(list.state.value).toBe('offline')
    expect(load).not.toHaveBeenCalled()
    brain.online = true
    await vi.waitFor(() => expect(list.value.value).toEqual(['Ana']))
  })

  it('a list that couldn’t load says so instead of looking empty, and Try again loads it', async () => {
    const { list } = listOf([new Error('no'), ['Ana']])
    await vi.waitFor(() => expect(list.state.value).toBe('failed'))
    expect(await list.reload()).toBe(true)
    expect(list.value.value).toEqual(['Ana'])
  })

  it('one that loaded before keeps showing while a later try fails', async () => {
    const { list } = listOf([['Ana'], new Error('no')])
    await vi.waitFor(() => expect(list.state.value).toBe('ready'))
    expect(await list.reload()).toBe(false)
    await nextTick()
    expect(list).toMatchObject({ state: { value: 'failed' }, value: { value: ['Ana'] } })
  })

  it('following something else (another event) never shows the old one’s list', async () => {
    const event = ref('e1')
    let answer: (id: string) => Promise<string[]> = async (id) => [`invited to ${id}`]
    const list = scope.run(() => useServerList(() => answer(event.value), [] as string[], { follow: event }))!
    await vi.waitFor(() => expect(list.value.value).toEqual(['invited to e1']))
    answer = () => new Promise<string[]>(() => {}) // the next event's list hasn't come yet
    event.value = 'e2'
    await nextTick()
    expect(list).toMatchObject({ state: { value: 'loading' }, value: { value: [] } })
  })
})
