import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DateInput from '@/components/DateInput.vue'

// The typed-date reader is still loading (it never arrives here), as on a slow first visit.
vi.mock('@/time/typedDate', () => ({ dateReader: () => null, loadDateReader: () => new Promise(() => {}) }))

describe('Spec §5 Date fields: a typed date is never lost', () => {
  it('a full date typed or pasted before the date reader loads is used straight away, so Save gets it', async () => {
    const box = mount(DateInput, { props: { modelValue: '2026-11-10', label: 'Date' } })
    await box.get('input').setValue('2026-11-20')
    expect(box.emitted('update:modelValue')).toEqual([['2026-11-20']])
  })
})
