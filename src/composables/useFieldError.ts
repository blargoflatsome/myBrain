// SPEC §5 Forms, When a save is refused: the field with the problem is marked for screen readers and linked to its
// message, focus moves to it, and changing it takes the mark away (WCAG 3.3.1). The message is read with the field
// when focus lands there, so it isn't a live region; only a refusal while focus is already in the field is said out loud.
import { nextTick, reactive, ref, useId, watch, type Directive } from 'vue'
import { announce } from '@/a11y/announce'

const CONTROL = 'input, select, textarea'
// A formatting editor's writing area, picked before the link box in its toolbar.
const WRITING = '[contenteditable="true"]'

/** One field's refusal. Bind the field with `v-field-error`, show the message with `<FieldError :of>`. */
export interface FieldError {
  /** The message's element id. */
  readonly id: string
  /** Why the save was refused, or '' when nothing is wrong. */
  readonly message: string
  /** Refuse the save because of this field: show why, then move focus to the field. */
  refuse(message: string): Promise<void>
  /** Take the message and the mark away. */
  clear(): void
  /** Set by `v-field-error`: the field to mark and focus. */
  attach(control: HTMLElement | null): void
}

export function useFieldError(): FieldError {
  const message = ref('')
  let control: HTMLElement | null = null
  return reactive({
    id: useId(),
    message,
    async refuse(text: string) {
      message.value = text
      await nextTick()
      const el = control
      if (!el) return
      // A field in a closed fold-out can't take focus, so its fold-outs open first.
      for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true
      if (document.activeElement === el) announce(text)
      else el.focus()
    },
    clear() {
      message.value = ''
    },
    attach(el: HTMLElement | null) {
      control = el
    },
  }) as FieldError
}

/** The field itself, or the one inside the component the directive is on. */
const controlIn = (el: HTMLElement) =>
  el.matches(CONTROL) ? el : (el.querySelector<HTMLElement>(WRITING) ?? el.querySelector<HTMLElement>(CONTROL))

interface Bound {
  error: FieldError
  clear: () => void
  stop: () => void
}
const bound = new WeakMap<HTMLElement, Bound>()

function sync(el: HTMLElement, error: FieldError) {
  const control = controlIn(el)
  error.attach(control)
  if (!control) return
  // "false" rather than no attribute: some browsers announce an empty required field as invalid from the start.
  control.setAttribute('aria-invalid', error.message ? 'true' : 'false')
  const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== error.id)
  if (error.message) ids.push(error.id)
  if (ids.length) control.setAttribute('aria-describedby', ids.join(' '))
  else control.removeAttribute('aria-describedby')
}

// The page around the field doesn't redraw when only the message changes, so the directive follows the message itself.
function follow(el: HTMLElement, entry: Bound) {
  entry.stop()
  sync(el, entry.error)
  entry.stop = watch(() => entry.error.message, () => sync(el, entry.error), { flush: 'post' })
}

/** `v-field-error="error"` on a field, or on a component that holds one (TitleField, TimeInput, DateInput). */
export const vFieldError: Directive<HTMLElement, FieldError> = {
  mounted(el, { value }) {
    const entry: Bound = { error: value, clear: () => entry.error.message && entry.error.clear(), stop: () => {} }
    bound.set(el, entry)
    el.addEventListener('input', entry.clear)
    el.addEventListener('change', entry.clear)
    follow(el, entry)
  },
  updated(el, { value }) {
    const entry = bound.get(el)
    if (!entry || entry.error === value) return
    entry.error = value
    follow(el, entry)
  },
  beforeUnmount(el) {
    const entry = bound.get(el)
    if (!entry) return
    entry.stop()
    el.removeEventListener('input', entry.clear)
    el.removeEventListener('change', entry.clear)
    entry.error.attach(null)
    bound.delete(el)
  },
}
