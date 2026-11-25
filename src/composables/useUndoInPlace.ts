// SPEC §2 Undo in place: removing one thing, moving it off a list or clearing a list happens straight away, and the
// spot it left shows a short line saying what happened, with Undo. No timer: the lines stay until I leave the page
// (or close the window they're in). Each one keeps its own Undo, so a newer one never replaces an older one.
import { ref, toRaw } from 'vue'
import { focusHere, focusPageHeading, untilShown } from '@/a11y/focus'

export interface UndoLine {
  key: number
  message: string
  undo: () => unknown
  /** The row this line stands in for, shown where it was; null for a line of its own (a cleared list, a calendar item). */
  rowId: string | null
  /** Which list on the page it stands in (a page with two lists keeps each line in its own). */
  list: string
  /** The row that came right after it, so the line keeps its place. */
  before: string | null
  /** Where focus lands after Undo, when the row brought back isn't simply the one at the line's place. */
  focusAfter?: () => HTMLElement | null | Promise<HTMLElement | null>
}

export interface UndoOptions {
  /**
   * The row removed (or moved away) and the rows the list showed, taken before the change, so the line takes its
   * place.
   */
  row?: { id: string; in: readonly { id: string }[] }
  /** Which list (or view: a day, a tab) the line belongs to, when the page has more than one. */
  list?: string
  focusAfter?: UndoLine['focusAfter']
}

const appeared = new WeakSet<UndoLine>()
/** True the first time a line is on screen (it takes focus then); false when it's drawn again (back on a tab). */
export function firstAppearance(line: UndoLine): boolean {
  const raw = toRaw(line)
  if (appeared.has(raw)) return false
  appeared.add(raw)
  return true
}

/** A row of the list, or the Undo line standing where a row was. */
export type Placed<T> = { key: string; row: T; line?: undefined } | { key: string; line: UndoLine; row?: undefined }

export function useUndoInPlace() {
  const lines = ref<UndoLine[]>([])
  let next = 0

  /** Show "message · Undo" where the row was (or as a line of its own); Undo runs `undo`. */
  function offer(message: string, undo: () => unknown, { row, list = 'main', focusAfter }: UndoOptions = {}) {
    const at = row ? row.in.findIndex((r) => r.id === row.id) : -1
    const line: UndoLine = {
      key: ++next,
      message,
      undo,
      rowId: row?.id ?? null,
      list,
      before: row && at >= 0 ? (row.in[at + 1]?.id ?? null) : null,
      focusAfter,
    }
    lines.value = [...lines.value.filter((l) => l.rowId === null || l.rowId !== line.rowId), line]
  }

  /** The list's rows with each Undo line in the place its row had. A row that's back (after Undo) drops its line. */
  function placed<T extends { id: string }>(rows: readonly T[], list = 'main'): Placed<T>[] {
    const ids = new Set(rows.map((r) => r.id))
    const waiting = lines.value.filter((l) => l.rowId !== null && l.list === list && !ids.has(l.rowId))
    const standingIn = new Set(waiting.map((l) => l.rowId))
    const out: Placed<T>[] = []
    const placedLines = new Set<UndoLine>()
    // A line goes just before what came after its row: a row, or the line of a row removed after it.
    const linesBefore = (id: string | null) => {
      for (const l of waiting) {
        if (l.before !== id || placedLines.has(l)) continue
        placedLines.add(l)
        linesBefore(l.rowId)
        out.push({ key: `undo-${l.key}`, line: l })
      }
    }
    for (const r of rows) {
      linesBefore(r.id)
      out.push({ key: r.id, row: r })
    }
    // It was last, or what came after it is gone without a line: the line goes at the end.
    for (const l of waiting) if (!placedLines.has(l) && !(l.before && standingIn.has(l.before))) linesBefore(l.before)
    return out
  }

  /** Lines of their own, not standing in for a row (a cleared list, a deleted calendar item, a renamed tag). */
  function ownLines(list = 'main'): UndoLine[] {
    return lines.value.filter((l) => l.rowId === null && l.list === list)
  }

  function drop(line: UndoLine) {
    lines.value = lines.value.filter((l) => l.key !== line.key)
  }

  /**
   * Undo: put it back and move focus to what came back (the row now in the line's place, or where `focusAfter`
   * says), or else the page's heading. `el` is the line on screen, so the row that takes its place can be found.
   */
  async function run(line: UndoLine, el: HTMLElement | null) {
    const parent = el?.parentElement ?? null
    const index = parent && el ? [...parent.children].indexOf(el) : -1
    // The row that came after the line slides into its place for a moment, until the one brought back arrives.
    const after = el?.nextElementSibling ?? null
    const hadFocus = !!el?.contains(document.activeElement)
    try {
      await line.undo()
    } catch (err) {
      // Nothing came back: the line (and its Undo) stays.
      console.error(err)
      return
    }
    drop(line)
    if (!hadFocus) return
    const target = await line.focusAfter?.()
    if (target?.isConnected) return focusHere(target)
    const back = () => (parent && index >= 0 ? (parent.children[index] as HTMLElement | undefined) : undefined)
    const isRow = () => {
      const b = back()
      return !!b && b !== after && !b.matches('[data-testid="undo-line"]')
    }
    if (line.rowId && (await untilShown(isRow))) {
      const row = back()!
      const control = row.querySelector<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')
      return focusHere(control ?? row)
    }
    focusPageHeading()
  }

  /** Forget every line (the window they were in closed). */
  function clear() {
    lines.value = []
  }

  return { lines, offer, placed, ownLines, run, drop, clear }
}
