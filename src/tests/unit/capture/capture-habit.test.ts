import { describe, expect, it } from 'vitest'
import { buildCaptureRecord } from '@/capture/capture'

describe('Spec §5 Quick capture: habits', () => {
  it('a captured habit uses the full habit form', () => {
    const r = buildCaptureRecord(
      { destination: 'habit', text: ' Stretch ', habit: { weekdays: [1, 3, 5], weekInterval: 2, notifyTime: '07:30', timerMinutes: 30, isPrivate: true, isPriority: true } },
      'u1',
      () => 'id1',
    )
    expect(r.table).toBe('habits')
    expect(r.row).toMatchObject({ id: 'id1', title: 'Stretch', weekdays: [1, 3, 5], week_interval: 2, notify_time: '07:30', timer_minutes: 30, is_private: true, is_priority: true })
  })
  it('a timer needs a reminder time', () => {
    const r = buildCaptureRecord({ destination: 'habit', text: 'Read', habit: { weekdays: [0, 1, 2, 3, 4, 5, 6], weekInterval: 1, notifyTime: null, timerMinutes: 30, isPrivate: false, isPriority: false } }, 'u1')
    expect(r.row).toMatchObject({ timer_minutes: null })
  })
})

