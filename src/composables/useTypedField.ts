// SPEC §5 Time fields and Date fields: what the two typed fields share. On a phone or tablet the device's own picker
// is used; on a computer I type into a box whose text settles to the saved value when I leave it (something that
// isn't a time or day goes back). An emptied box means none, unless the field is required: then it goes back too.
// Each field keeps its own list or grid and keys.
import { onScopeDispose, ref, watch } from 'vue'

export interface TypedFieldOptions {
  /** The saved value, '' when there is none. */
  value: () => string
  /** The saved value as the box shows it ('' stays ''). */
  show: (value: string) => string
  required: () => boolean
  /** Save a new value ('' for none). */
  save: (value: string) => void
}

export function useTypedField({ value, show, required, save }: TypedFieldOptions) {
  // Touch devices keep their own picker, which is easy to use with a finger.
  const coarseQuery = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null
  const touch = ref(!!coarseQuery?.matches)
  const onPointerChange = (e: MediaQueryListEvent) => (touch.value = e.matches)
  coarseQuery?.addEventListener('change', onPointerChange)
  onScopeDispose(() => coarseQuery?.removeEventListener('change', onPointerChange))

  const shown = (v: string) => (v ? show(v) : '')
  /** What the typed box shows. */
  const text = ref(shown(value()))
  const typing = ref(false)
  watch(value, (v) => {
    if (!typing.value) text.value = shown(v)
  })

  /** I typed in the box. Returns the text to read, or null when the box is empty (handled here). */
  function type(event: Event): string | null {
    typing.value = true
    text.value = (event.target as HTMLInputElement).value
    if (text.value.trim()) return text.value
    if (!required()) save('')
    return null
  }
  /** I left the box: it shows the saved value. */
  function settle() {
    typing.value = false
    text.value = shown(value())
  }
  /** Picked from the list or grid. */
  function pick(v: string) {
    save(v)
    typing.value = false
    text.value = shown(v)
  }

  return { touch, text, type, settle, pick }
}
