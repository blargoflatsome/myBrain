import { describe, expect, it } from 'vitest'
import { boardOrder, frontPosition, noteLines, noteToTask } from './rules'
import type { PostItRow } from '@/sync/types'

const note = (id: string, position: number, extra: Partial<PostItRow> = {}): PostItRow => ({
  id,
  user_id: 'u',
  body: '<p>x</p>',
  color: 'yellow',
  position,
  deleted_at: null,
  created_at: `2026-11-0${id.length}T00:00:00Z`,
  ...extra,
})

describe('Spec §5 Post It', () => {
  it('the board shows notes by position, front first, without removed ones; a new note goes in front', () => {
    const notes = [note('a', 1), note('bb', -1), note('ccc', 0, { deleted_at: '2026-11-07T00:00:00Z' })]
    expect(boardOrder(notes).map((n) => n.id)).toEqual(['bb', 'a'])
    expect(frontPosition(notes)).toBe(-2)
    expect(frontPosition([])).toBe(0)
  })

  it('Make a task: the first line is the title and the rest the notes', () => {
    expect(noteToTask('<p><strong>Call</strong> the vet</p><ul><li><p>ask about shots</p></li><li><p>book June</p></li></ul>')).toEqual({
      title: 'Call the vet',
      notes: 'ask about shots\nbook June',
    })
    expect(noteToTask('<p>Just one line</p>')).toEqual({ title: 'Just one line', notes: null })
    expect(noteToTask('<p></p>')).toBeNull()
    expect(noteLines('<p>one<br>two</p>')).toEqual(['one', 'two'])
  })

  it('a very long first line is cut for the title and kept whole in the notes', () => {
    const long = 'a'.repeat(250)
    const t = noteToTask(`<p>${long}</p>`)!
    expect(t.title).toHaveLength(200)
    expect(t.notes).toBe(long)
  })
})
