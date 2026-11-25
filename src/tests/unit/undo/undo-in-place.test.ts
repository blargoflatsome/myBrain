import { describe, expect, it } from 'vitest'
import { useUndoInPlace } from '@/composables/useUndoInPlace'

const rows = (...ids: string[]) => ids.map((id) => ({ id }))
/** The list as drawn: row ids, and "undo:<id>" where a line stands in for a row. */
const drawn = (undoable: ReturnType<typeof useUndoInPlace>, list: { id: string }[], name?: string) =>
  undoable.placed(list, name).map((e) => (e.line ? `undo:${e.line.rowId}` : e.row!.id))

describe('SPEC §2 Undo in place: the line stands where the row was', () => {
  it.each([
    { what: 'a row in the middle', before: ['a', 'b', 'c'], removed: ['b'], after: ['a', 'c'], shown: ['a', 'undo:b', 'c'] },
    { what: 'the last row', before: ['a', 'b', 'c'], removed: ['c'], after: ['a', 'b'], shown: ['a', 'b', 'undo:c'] },
    { what: 'the first row', before: ['a', 'b'], removed: ['a'], after: ['b'], shown: ['undo:a', 'b'] },
    { what: 'two neighbours, one after the other', before: ['a', 'b', 'c', 'd'], removed: ['b', 'c'], after: ['a', 'd'], shown: ['a', 'undo:b', 'undo:c', 'd'] },
  ])('$what', ({ before, removed, after, shown }) => {
    const undoable = useUndoInPlace()
    let list = rows(...before)
    for (const id of removed) {
      undoable.offer(`Deleted ${id}`, () => {}, { row: { id, in: list } })
      list = list.filter((r) => r.id !== id)
    }
    expect(list.map((r) => r.id)).toEqual(after)
    expect(drawn(undoable, list)).toEqual(shown)
  })

  it('a row that comes back (Undo, or another device) drops its line', () => {
    const undoable = useUndoInPlace()
    undoable.offer('Deleted b', () => {}, { row: { id: 'b', in: rows('a', 'b') } })
    expect(drawn(undoable, rows('a', 'b'))).toEqual(['a', 'b'])
  })

  it('each list keeps its own lines, and a line of its own only shows in its list', () => {
    const undoable = useUndoInPlace()
    undoable.offer('Deleted b', () => {}, { row: { id: 'b', in: rows('a', 'b') }, list: 'monday' })
    undoable.offer('Cleared 2', () => {}, { list: 'monday' })
    expect(drawn(undoable, rows('x'), 'tuesday')).toEqual(['x'])
    expect(drawn(undoable, rows('a'), 'monday')).toEqual(['a', 'undo:b'])
    expect(undoable.ownLines('tuesday')).toEqual([])
    expect(undoable.ownLines('monday').map((l) => l.message)).toEqual(['Cleared 2'])
  })

  it('Undo that fails keeps the line, so it can be tried again', async () => {
    const undoable = useUndoInPlace()
    undoable.offer('Deleted b', () => Promise.reject(new Error('no')), { row: { id: 'b', in: rows('a', 'b') } })
    const original = console.error
    console.error = () => {}
    await undoable.run(undoable.lines.value[0]!, null)
    console.error = original
    expect(drawn(undoable, rows('a'))).toEqual(['a', 'undo:b'])
  })
})
