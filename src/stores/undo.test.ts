import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { UNDO_MS, useUndoStore } from './undo'

describe('Spec §2: Undo after removing one thing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('shows for 8 seconds, then goes away', () => {
    const undo = useUndoStore()
    undo.offer('Deleted "x"', () => {})
    vi.advanceTimersByTime(UNDO_MS - 1)
    expect(undo.current?.message).toBe('Deleted "x"')
    vi.advanceTimersByTime(1)
    expect(undo.current).toBeNull()
  })

  it('Undo puts it back, once', async () => {
    const undo = useUndoStore()
    const back = vi.fn()
    undo.offer('Deleted "x"', back)
    await undo.run()
    await undo.run()
    expect(back).toHaveBeenCalledTimes(1)
    expect(undo.current).toBeNull()
  })

  it('the timer waits while the mouse or keyboard is on the bar (WCAG 2.2.1)', () => {
    const undo = useUndoStore()
    undo.offer('Deleted "x"', () => {})
    undo.pause()
    vi.advanceTimersByTime(UNDO_MS * 3)
    expect(undo.current).not.toBeNull()
    undo.resume()
    vi.advanceTimersByTime(UNDO_MS)
    expect(undo.current).toBeNull()
  })

  it('a newer action replaces the older one', () => {
    const undo = useUndoStore()
    undo.offer('first', () => {})
    undo.offer('second', () => {})
    expect(undo.current?.message).toBe('second')
  })
})
