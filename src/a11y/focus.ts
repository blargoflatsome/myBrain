// SPEC §2 Accessibility: while a window (modal) is open, Tab and Shift+Tab stay inside it; when it closes, focus goes
// back to what opened it. Every window is a native <dialog> opened with showModal() (the full-screen screens too), so the
// browser makes the page behind it inert; this file adds the Tab wrap, the focus fallback and click-outside.

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

/** The window on top: the most recently opened modal <dialog> that is still open. */
export function topModal(): HTMLDialogElement | null {
  for (let i = opened.length - 1; i >= 0; i--) {
    const d = opened[i]!
    if (d.isConnected && d.open && d.matches(':modal')) return d
    opened.splice(i, 1)
  }
  return null
}

/** Sent on `document` when a window opens, and when one has closed and focus is back where it belongs. */
export const WINDOWS_CHANGED = 'my-brain:windows-changed'

/**
 * Focus this now, or, when a window open on top doesn't hold it, once no window is open (an Undo line drawn on the
 * page as its editor window closes). Returns a function that stops waiting.
 */
export function focusWhenFree(el: HTMLElement): () => void {
  const top = topModal()
  if (!top || top.contains(el)) {
    el.focus()
    return () => {}
  }
  const stop = () => document.removeEventListener(WINDOWS_CHANGED, onChange)
  function onChange() {
    if (topModal()) return
    stop()
    if (el.isConnected) el.focus()
  }
  document.addEventListener(WINDOWS_CHANGED, onChange)
  return stop
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

/**
 * Put focus back where it was before a window opened; if that is gone, on the page's heading. Focus the page already
 * moved somewhere outside the closed window stays there (the browser's own return to the opener, or the Undo line
 * that took a row's place as its editor closed, SPEC §2 Undo in place).
 */
export function restoreFocus(opener: Element | null, closed?: HTMLDialogElement) {
  // Another window took over (one window replaced by the next): leave focus with it.
  const top = topModal()
  if (top && !(opener && top.contains(opener))) return
  const active = document.activeElement
  if (closed && active instanceof HTMLElement && active !== document.body && active.isConnected && !closed.contains(active)) return
  if (opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length > 0) {
    opener.focus()
    return
  }
  focusPageHeading()
}

/** Focus the page's heading (or the page itself), where keyboard users land when what they were on is gone. */
export function focusPageHeading() {
  const fallback = document.querySelector<HTMLElement>('#content h1') ?? document.getElementById('content')
  if (fallback) focusHere(fallback)
}

/** Focus an element that may not take focus by itself (a heading, a card). */
export function focusHere(el: HTMLElement) {
  if (!el.matches(FOCUSABLE) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus()
}

/**
 * Wait until something shows on screen (a row brought back by Undo reaches the page a moment after it is saved), for
 * up to about a second. Returns whether it did.
 */
export async function untilShown(shown: () => boolean, frames = 60) {
  for (let i = 0; i < frames && !shown(); i++) await new Promise((r) => requestAnimationFrame(r))
  return shown()
}

const outsideWatched = new WeakSet<HTMLDialogElement>()

/** Whether a point is outside the window's box (on the dimmed backdrop). */
function outside(dialog: HTMLDialogElement, x: number, y: number) {
  const r = dialog.getBoundingClientRect()
  return x < r.left || x > r.right || y < r.top || y > r.bottom
}

/** Whether the browser closes windows on a backdrop click itself (<dialog closedby="any">; not in Safari yet). */
export const nativeClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype

/**
 * SPEC §2 Windows: a click on the backdrop closes the window, like Escape: a "cancel" event goes first, so a window
 * that must not close yet (sharing, one person at a time) can stop it. The press has to start outside too, so
 * selecting text inside and letting go outside doesn't close anything. Browsers with closedby do all this themselves;
 * this is the fallback for the rest, and only for windows marked closedby="any".
 */
export function closeOnOutsideClick(dialog: HTMLDialogElement) {
  if (outsideWatched.has(dialog) || dialog.getAttribute('closedby') !== 'any') return
  outsideWatched.add(dialog)
  let pressedOutside = false
  dialog.addEventListener('pointerdown', (e) => {
    pressedOutside = e.target === dialog && outside(dialog, e.clientX, e.clientY)
  })
  dialog.addEventListener('click', (e) => {
    const wasOutside = pressedOutside
    pressedOutside = false
    // Keyboard "clicks" on buttons report 0,0 with the button as target, so only the dialog itself counts.
    if (!wasOutside || e.target !== dialog || !outside(dialog, e.clientX, e.clientY) || !dialog.open) return
    if (topModal() !== dialog) return
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
  })
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
    // Every window closes on a click outside unless it says otherwise (the priority reminder says closedby="none").
    if (!this.hasAttribute('closedby')) this.setAttribute('closedby', 'any')
    showModal.call(this)
    opened.push(this)
    document.dispatchEvent(new Event(WINDOWS_CHANGED))
    if (!nativeClosedBy) closeOnOutsideClick(this)
    this.addEventListener(
      'close',
      () => {
        const at = opened.indexOf(this)
        if (at >= 0) opened.splice(at, 1)
        setTimeout(() => {
          restoreFocus(opener, this)
          document.dispatchEvent(new Event(WINDOWS_CHANGED))
        })
      },
      { once: true },
    )
  }
  document.addEventListener('keydown', trapTab)
  document.addEventListener('keydown', escapeFromSearchBox)
}

/**
 * SPEC §2 Windows: Escape closes the window, also from a search box. There the browser's own Escape only empties the
 * box and the window stays open, so it's closed here instead, with the "cancel" first, as Escape and the backdrop do.
 */
function escapeFromSearchBox(event: KeyboardEvent) {
  // An Escape that ends typing with an input method (Japanese, Chinese) belongs to the box, not the window.
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  const box = event.target
  if (!(box instanceof HTMLInputElement) || box.type !== 'search') return
  const modal = topModal()
  if (!modal?.contains(box)) return
  event.preventDefault()
  if (modal.dispatchEvent(new Event('cancel', { cancelable: true }))) modal.close()
}
