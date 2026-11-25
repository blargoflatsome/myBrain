import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import FieldError from '@/components/FieldError.vue'
import { useFieldError, vFieldError } from '@/composables/useFieldError'

// A field in a closed fold-out, with its hint, like Capture's reminder time or the event editor's end time.
const Form = defineComponent({
  components: { FieldError },
  directives: { fieldError: vFieldError },
  setup: () => ({ error: useFieldError() }),
  template: `
    <form>
      <button type="button" data-testid="save">Save</button>
      <details>
        <summary>More details</summary>
        <label>Ends <input v-field-error="error" aria-describedby="hint" data-testid="field"></label>
        <span id="hint">Same day or later.</span>
        <FieldError :of="error" />
      </details>
    </form>`,
})

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

function setup() {
  wrapper = mount(Form, { attachTo: document.body })
  const field = wrapper.get<HTMLInputElement>('[data-testid="field"]').element
  const error = (wrapper.vm as unknown as { error: ReturnType<typeof useFieldError> }).error
  return { field, error }
}

describe('SPEC §5 Forms: when a save is refused', () => {
  it('marks the field, links its message beside the hint, opens its fold-out and moves focus there', async () => {
    const { field, error } = setup()
    expect(field.getAttribute('aria-invalid')).toBe('false')
    wrapper!.get<HTMLButtonElement>('[data-testid="save"]').element.focus()
    await error.refuse('It needs to end after it starts.')
    await flushPromises()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe(`hint ${error.id}`)
    expect(document.getElementById(error.id)?.textContent).toBe('It needs to end after it starts.')
    expect(field.closest('details')!.open).toBe(true)
    expect(document.activeElement).toBe(field)
  })

  it('changing the field takes the mark and the message away, and the hint stays', async () => {
    const { field, error } = setup()
    await error.refuse('It needs to end after it starts.')
    field.value = '15:00'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect({ invalid: field.getAttribute('aria-invalid'), describedBy: field.getAttribute('aria-describedby'), message: error.message }).toEqual({
      invalid: 'false',
      describedBy: 'hint',
      message: '',
    })
    expect(document.getElementById(error.id)).toBeNull()
  })

  it('refused while focus is already in the field (Enter pressed there): the message is said out loud', async () => {
    vi.useFakeTimers()
    const { field, error } = setup()
    field.closest('details')!.open = true
    field.focus()
    await error.refuse('Add an email address or a phone number.')
    await vi.runAllTimersAsync()
    expect(document.querySelector('[data-announcer]')?.textContent).toBe('Add an email address or a phone number.')
  })

  it("refused when its field isn't shown (an all-day day has no Until): the message is said out loud", async () => {
    vi.useFakeTimers()
    let error!: ReturnType<typeof useFieldError>
    wrapper = mount(defineComponent({ setup: () => ((error = useFieldError()), () => null) }), { attachTo: document.body })
    await error.refuse('The end time needs to be after the start.')
    await vi.runAllTimersAsync()
    expect(document.querySelector('[data-announcer]')?.textContent).toBe('The end time needs to be after the start.')
  })
})
