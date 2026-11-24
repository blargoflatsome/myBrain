import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { UNDO_MS, useUndoStore } from '@/stores/undo'
import { messages } from '@/messages'

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
    expect(undo.current?.message).toBe(messages.undo.deleted('x'))
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

  // SPEC §2 Keyboard: focus moves to Undo only for a delete done from the keyboard, never for an offer that comes by itself.
  it.each([
    { what: 'Enter on a button', key: 'Enter', on: 'button', later: 0, takesFocus: true },
    { what: 'Space on a button', key: ' ', on: 'button', later: 0, takesFocus: true },
    { what: 'typing in a text field', key: 'Enter', on: 'textarea', later: 0, takesFocus: false },
    { what: 'an offer long after the press (a trophy arriving)', key: 'Enter', on: 'button', later: 5000, takesFocus: false },
  ])('$what: takes focus is $takesFocus', ({ key, on, later, takesFocus }) => {
    const el = document.body.appendChild(document.createElement(on))
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    vi.advanceTimersByTime(later)
    const undo = useUndoStore()
    undo.offer('Deleted "x"', () => {})
    expect(undo.current?.byKeyboard).toBe(takesFocus)
    el.remove()
  })

  it('a click after a keypress is not a keyboard delete', () => {
    const button = document.body.appendChild(document.createElement('button'))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const undo = useUndoStore()
    undo.offer('Deleted "x"', () => {})
    expect(undo.current?.byKeyboard).toBe(false)
    button.remove()
  })
})
