// Writing Post Its (SPEC §5 Quick capture and Dashboard).
import type { PostItColor, PostItRow } from '@/sync/types'
import { removeWithUndo, type ActionContext } from '@/sync/actions'
import { normalizeBody } from '@/journal/body'
import { frontPosition } from '@/postits/rules'
import { achieved } from '@/celebrate/bus'

export function postItActions({ ready }: ActionContext) {
  /** A new Post It goes in front of the others. Returns null when nothing was written. */
  async function addPostIt(html: string, color: PostItColor, now = new Date()) {
    const { engine: e, uid, local } = ready()
    const body = normalizeBody(html)
    if (!body) return null
    const row: PostItRow = { id: crypto.randomUUID(), user_id: uid, body, color, position: frontPosition(await local.post_its.toArray()), created_at: now.toISOString(), deleted_at: null }
    const saved = await e.save('post_its', row)
    achieved({ kind: 'postit' })
    return saved
  }

  /** Save a Post It as edited. Returns null when nothing is left written. */
  async function savePostIt(row: PostItRow) {
    const body = normalizeBody(row.body)
    if (!body) return null
    return ready().engine.save('post_its', { ...row, body })
  }

  /** Delete a Post It. Returns its Undo (SPEC §2). */
  const deletePostIt = (id: string) => removeWithUndo(ready, 'post_its', [id])

  return { addPostIt, savePostIt, deletePostIt }
}
