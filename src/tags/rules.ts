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

// ---------- Tags page (SPEC §5 Tags page) ----------

export interface TagUse {
  tag: TagRow
  counts: Record<TaggedType, number>
  total: number
}

/** Every live tag A to Z with how many live tasks, habits and routines it is on. */
export function tagUsage(tags: TagRow[], itemTags: ItemTagRow[], liveItemIds: Record<TaggedType, Set<string>>): TagUse[] {
  const uses = new Map<string, TagUse>()
  for (const tag of tags) if (!tag.deleted_at) uses.set(tag.id, { tag, counts: { task: 0, habit: 0, routine: 0 }, total: 0 })
  for (const link of itemTags) {
    const use = uses.get(link.tag_id)
    if (!use || link.deleted_at || !liveItemIds[link.item_type]?.has(link.item_id)) continue
    use.counts[link.item_type]++
    use.total++
  }
  return [...uses.values()].sort((a, b) => a.tag.name.localeCompare(b.tag.name, undefined, { sensitivity: 'base' }))
}

export interface MoveLinks {
  add: ItemTagRow[]
  remove: ItemTagRow[]
}

/**
 * Moving every item from one tag to another: each live link to `fromId` is taken off, and a link to `intoId` is
 * added unless the item already has it. New links use the usual made-from-ids id, so a once-removed link comes back.
 */
export function moveLinks(userId: string, fromId: string, intoId: string, itemTags: ItemTagRow[]): MoveLinks {
  const liveLinks = itemTags.filter((it) => !it.deleted_at)
  const already = new Set(liveLinks.filter((it) => it.tag_id === intoId).map((it) => `${it.item_type}:${it.item_id}`))
  const remove = liveLinks.filter((it) => it.tag_id === fromId)
  const add = remove
    .filter((it) => !already.has(`${it.item_type}:${it.item_id}`))
    .map((it) => ({ id: itemTagIdFor(it.item_id, intoId), user_id: userId, tag_id: intoId, item_type: it.item_type, item_id: it.item_id, deleted_at: null }))
  return { add, remove }
}

export type RenameOutcome =
  | { kind: 'empty' }
  | { kind: 'unchanged' }
  /** Only the capital letters change: same tag, new spelling. */
  | { kind: 'respell'; name: string }
  /** Another tag already has the name: offer to merge into it. */
  | { kind: 'clash'; other: TagRow }
  /** A new name: a new tag (its id comes from the name) takes over the items, and the old one goes. */
  | { kind: 'rename'; name: string; newTag: TagRow }

/**
 * What renaming a tag means. Tag ids come from their names (`tagIdFor`), so a real rename makes the tag for the new
 * name and moves the items over; keeping the old id would let a later tag with the old name overwrite this one.
 */
export function renameOutcome(userId: string, tag: TagRow, typed: string, tags: TagRow[]): RenameOutcome {
  const name = cleanTagName(typed)
  if (!name) return { kind: 'empty' }
  if (name === tag.name) return { kind: 'unchanged' }
  if (name.toLowerCase() === tag.name.toLowerCase()) return { kind: 'respell', name }
  const other = tags.find((t) => !t.deleted_at && t.id !== tag.id && t.name.toLowerCase() === name.toLowerCase())
  if (other) return { kind: 'clash', other }
  return { kind: 'rename', name, newTag: { id: tagIdFor(userId, name), user_id: userId, name, deleted_at: null } }
}
