// SPEC §2 Accessibility: something to say out loud that moving focus can't say, through one polite live region. It
// sits in the window on top, because a modal <dialog> makes everything outside it inert, live regions included.
import { topModal } from '@/a11y/focus'

let timer: ReturnType<typeof setTimeout> | undefined

/** The live region in the window on top (or the page), made the first time it's needed there. */
function region(): HTMLElement {
  const host = topModal() ?? document.body
  let el = host.querySelector<HTMLElement>(':scope > [data-announcer]')
  if (!el) {
    el = document.createElement('div')
    el.dataset.announcer = ''
    el.setAttribute('aria-live', 'polite')
    el.className = 'sr-only'
    host.append(el)
  }
  return el
}

/** Say this to screen readers. Emptied first, so the same words said twice are heard twice. */
export function announce(text: string) {
  const el = region()
  el.textContent = ''
  clearTimeout(timer)
  // A short wait, so the emptied region and the new words are two changes, not one.
  timer = setTimeout(() => (el.textContent = text), 100)
}
