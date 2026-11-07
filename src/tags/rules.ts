// Tag rules (SPEC §5 Global search and tags): names, ids that match on every device, and what changes on save.
import type { ItemTagRow, TaggedType, TagRow } from '@/sync/types'

export const TAG_MAX = 40

/** Tidy a typed tag name: trimmed, single spaces, at most 40 characters. */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX)
}

/** A 128-bit hash (cyrb128) of a string, as 32 hex characters. */
function hash128(text: string): string {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('')
}

/**
 * A tag's id comes from my user id and its name (ignoring case), so the same tag made on two devices, even offline,
 * is one row instead of two (SPEC §7).
 */
export function tagIdFor(userId: string, name: string): string {
  const h = hash128(`${userId}:${cleanTagName(name).toLowerCase()}`)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** The same item and tag always give the same id, so adding a tag twice updates one row. */
export function itemTagIdFor(itemId: string, tagId: string): string {
  return `${itemId.slice(0, 24)}${tagId.slice(24)}`
}

/** The tags on an item, by name. */
export function tagsOf(itemTags: ItemTagRow[], tags: TagRow[], type: TaggedType, itemId: string): TagRow[] {
  const byId = new Map(tags.filter((t) => !t.deleted_at).map((t) => [t.id, t]))
  return itemTags
    .filter((it) => !it.deleted_at && it.item_type === type && it.item_id === itemId)
    .map((it) => byId.get(it.tag_id))
    .filter((t): t is TagRow => !!t)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface TagChanges {
  newTags: TagRow[]
  add: ItemTagRow[]
  remove: ItemTagRow[]
}

/** What saving an item's tag names changes: new tags to create, links to add, links to remove. */
export function tagChanges(
  userId: string,
  type: TaggedType,
  itemId: string,
  names: string[],
  tags: TagRow[],
  itemTags: ItemTagRow[],
): TagChanges {
  const wanted = new Map<string, string>()
  for (const raw of names) {
    const name = cleanTagName(raw)
    if (name) wanted.set(name.toLowerCase(), name)
  }
  const live = tags.filter((t) => !t.deleted_at)
  const newTags: TagRow[] = []
  const wantedIds = new Set<string>()
  for (const [lower, name] of wanted) {
    const existing = live.find((t) => t.name.toLowerCase() === lower)
    if (existing) wantedIds.add(existing.id)
    else {
      const tag: TagRow = { id: tagIdFor(userId, name), user_id: userId, name, deleted_at: null }
      newTags.push(tag)
      wantedIds.add(tag.id)
    }
  }
  const current = itemTags.filter((it) => !it.deleted_at && it.item_type === type && it.item_id === itemId)
  const currentIds = new Set(current.map((it) => it.tag_id))
  const add = [...wantedIds]
    .filter((id) => !currentIds.has(id))
    .map((tagId) => ({ id: itemTagIdFor(itemId, tagId), user_id: userId, tag_id: tagId, item_type: type, item_id: itemId, deleted_at: null }))
  const remove = current.filter((it) => !wantedIds.has(it.tag_id))
  return { newTags, add, remove }
}
