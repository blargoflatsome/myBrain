import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DateInput from '@/components/DateInput.vue'
import TimeInput from '@/components/TimeInput.vue'
import { dayLabel } from '@/ui/dates'
import { formatTime } from '@/time/parse'
import { deviceTimeZone, todayIn } from '@/time/days'

// The typed-date reader here reads only full dates (words like "tomorrow" are its own tests).
vi.mock('@/time/typedDate', () => ({ dateReader: () => null, loadDateReader: async () => () => null }))

const fields = [
  { name: 'Date fields', field: DateInput, saved: '2026-11-10', typed: '2026-11-20', reads: '2026-11-20', shows: (v: string) => dayLabel(v, todayIn(deviceTimeZone())) },
  { name: 'Time fields', field: TimeInput, saved: '08:00', typed: '830', reads: '08:30', shows: formatTime },
]

describe.each(fields)('SPEC §5 $name: the typed box (on a computer)', ({ field, saved, typed, reads, shows }) => {
  const box = (required = false) => mount(field, { props: { modelValue: saved, label: 'When', required } })

  it('what I type is used at once, so Save straight after gets it', async () => {
    const b = box()
    await b.get('input').setValue(typed)
    expect(b.emitted('update:modelValue')?.at(-1)).toEqual([reads])
  })

  it('something that isn\'t one goes back to the saved one when I leave the box', async () => {
    const b = box()
    const input = b.get('input')
    await input.setValue('banana')
    await input.trigger('blur')
    await flushPromises()
    expect(b.emitted('update:modelValue')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe(shows(saved))
  })

  it('an emptied box means none', async () => {
    const b = box()
    await b.get('input').setValue('')
    expect(b.emitted('update:modelValue')).toEqual([['']])
  })

  it('an emptied required box keeps the saved one and shows it again when I leave', async () => {
    const b = box(true)
    const input = b.get('input')
    await input.setValue('')
    await input.trigger('blur')
    await flushPromises()
    expect(b.emitted('update:modelValue')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe(shows(saved))
  })
})
