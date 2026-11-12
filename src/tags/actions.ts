// Reading and writing tags and the links between tags and items (SPEC §5 Global search and tags, Tags page).
import type { TagRow, TaggedType } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { moveLinks, renameOutcome, tagChanges } from '@/tags/rules'

export function tagActions({ ready }: ActionContext) {
  /** Set an item's tags by name: new tags are created, dropped ones are taken off the item (the tag itself stays). */
  async function saveTags(type: TaggedType, itemId: string, names: string[]) {
    const { engine: e, uid, local } = ready()
    const changes = tagChanges(uid, type, itemId, names, await local.tags.toArray(), await local.item_tags.where('item_id').equals(itemId).toArray())
    for (const tag of changes.newTags) await e.save('tags', tag)
    for (const link of changes.add) await e.save('item_tags', link)
    await e.removeMany('item_tags', changes.remove.map((l) => l.id))
  }

  // The Tags page: each change hands back its undo.

  /** Move every item from one tag to another and remove the first tag. */
  async function mergeTags(fromId: string, intoId: string): Promise<() => Promise<void>> {
    const { engine: e, uid, local } = ready()
    const { add, remove } = moveLinks(uid, fromId, intoId, await local.item_tags.toArray())
    for (const link of add) await e.save('item_tags', link)
    await e.removeMany('item_tags', remove.map((l) => l.id))
    await e.remove('tags', fromId)
    return async () => {
      await e.patch('tags', fromId, () => ({ deleted_at: null }))
      for (const link of remove) await e.patch('item_tags', link.id, () => ({ deleted_at: null }))
      await e.removeMany('item_tags', add.map((l) => l.id))
    }
  }

  /** Rename a tag everywhere. Returns null when nothing changes, or when another tag has the name (merge instead). */
  async function renameTag(tag: TagRow, typed: string): Promise<{ undo: () => Promise<void> } | { clash: TagRow } | null> {
    const { engine: e, uid, local } = ready()
    const outcome = renameOutcome(uid, tag, typed, await local.tags.toArray())
    if (outcome.kind === 'empty' || outcome.kind === 'unchanged') return null
    if (outcome.kind === 'clash') return { clash: outcome.other }
    if (outcome.kind === 'respell') {
      await e.patch('tags', tag.id, () => ({ name: outcome.name }))
      return { undo: async () => void (await e.patch('tags', tag.id, () => ({ name: tag.name }))) }
    }
    await e.save('tags', outcome.newTag)
    const undoMove = await mergeTags(tag.id, outcome.newTag.id)
    return {
      undo: async () => {
        await undoMove()
        await e.remove('tags', outcome.newTag.id)
      },
    }
  }

  /** Delete a tag: it comes off every item; the items stay. */
  async function deleteTag(tagId: string): Promise<() => Promise<void>> {
    const { engine: e, local } = ready()
    const links = (await local.item_tags.toArray()).filter((it) => it.tag_id === tagId && !it.deleted_at)
    await e.removeMany('item_tags', links.map((l) => l.id))
    await e.remove('tags', tagId)
    return async () => {
      await e.patch('tags', tagId, () => ({ deleted_at: null }))
      for (const link of links) await e.patch('item_tags', link.id, () => ({ deleted_at: null }))
    }
  }

  return { saveTags, mergeTags, renameTag, deleteTag }
}
