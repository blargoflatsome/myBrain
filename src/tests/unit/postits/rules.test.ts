import { describe, expect, it } from 'vitest'
import { boardOrder, frontPosition } from '@/postits/rules'
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
})
