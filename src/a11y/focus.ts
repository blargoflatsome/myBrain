// SPEC §2 Accessibility: while a window (modal) is open, Tab and Shift+Tab stay inside it; when it closes, focus goes
// back to what opened it. One place handles every window: native <dialog>s opened with showModal(), and anything
// marked aria-modal="true" (the full-screen editor, the phone menu).

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** What can take focus inside a container, in order, skipping anything hidden. */
export function focusables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert]')) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none' && el.getClientRects().length > 0
  })
}

/** Modal <dialog>s in the order they opened, so a confirmation opened over an editor is on top. */
const opened: HTMLDialogElement[] = []

/** The window on top: the most recently opened modal <dialog>, else the last visible aria-modal element. */
export function topModal(doc: Document = document): HTMLElement | null {
  for (let i = opened.length - 1; i >= 0; i--) {
    const d = opened[i]!
    if (d.isConnected && d.open && d.matches(':modal')) return d
    opened.splice(i, 1)
  }
  const marked = [...doc.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter((el) => !(el instanceof HTMLDialogElement) && el.getClientRects().length > 0)
  return marked.at(-1) ?? null
}

/** Keep Tab inside the window on top: from the last item it wraps to the first, and back. */
export function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  const modal = topModal()
  if (!modal) return
  const items = focusables(modal)
  if (!items.length) {
    event.preventDefault()
    modal.focus()
    return
  }
  const first = items[0]!
  const last = items.at(-1)!
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && modal.contains(active)
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault()
    first.focus()
  }
}

/** Put focus back where it was before a window opened; if that is gone, on the page's heading. */
export function restoreFocus(opener: Element | null) {
  // Another window took over (one window replaced by the next): leave focus with it.
  const top = topModal()
  if (top && !(opener && top.contains(opener))) return
  if (opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length > 0) {
    opener.focus()
    return
  }
  const fallback = document.querySelector<HTMLElement>('#content h1') ?? document.getElementById('content')
  if (fallback) {
    if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1')
    fallback.focus()
  }
}

/**
 * Install once at start-up. Every showModal() remembers what had focus, and that element gets focus back when the
 * window closes (by a button, Escape or code).
 */
export function installModalFocus() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { __focusPatched?: boolean }
  if (proto.__focusPatched) return
  proto.__focusPatched = true
  const showModal = proto.showModal
  proto.showModal = function (this: HTMLDialogElement) {
    const opener = document.activeElement
    showModal.call(this)
    opened.push(this)
    this.addEventListener(
      'close',
      () => {
        const at = opened.indexOf(this)
        if (at >= 0) opened.splice(at, 1)
        setTimeout(() => restoreFocus(opener))
      },
      { once: true },
    )
  }
  document.addEventListener('keydown', trapTab)
}
