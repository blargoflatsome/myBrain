// Search (SPEC §5 Global search and tags): runs on the device's copy of my data, so it is instant and works offline.
import type { EventRow, ItemTagRow, JournalEntryRow, QuestRow, TaggedType, TaskRow, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { plainText } from '@/journal/body'

export interface SearchDoc {
  type: TaggedType
  id: string
  title: string
  /** The searchable words (title, notes, writing), as typed. */
  body: string
  /** Lower case, without accents, for matching. */
  haystack: string
  tagIds: Set<string>
  updatedAt: string
  /** Where to open it: a date (task, journal, event) or a bucket (vault item). */
  date?: string | null
  bucketId?: string
  context?: string
}

/** Lower case and accents removed, so "Café" matches "cafe". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export interface SearchData {
  tasks: TaskRow[]
  vaultItems: VaultItemRow[]
  buckets: VaultBucketRow[]
  journal: JournalEntryRow[]
  quests: QuestRow[]
  events: EventRow[]
  itemTags: ItemTagRow[]
}

/** Everything searchable, one document per item. Deleted items are left out. */
export function searchDocs(data: SearchData): SearchDoc[] {
  const tagsByItem = new Map<string, Set<string>>()
  for (const it of data.itemTags) {
    if (it.deleted_at) continue
    const key = `${it.item_type}:${it.item_id}`
    if (!tagsByItem.has(key)) tagsByItem.set(key, new Set())
    tagsByItem.get(key)!.add(it.tag_id)
  }
  const doc = (type: TaggedType, id: string, title: string, body: string, updatedAt: string | undefined, extra: Partial<SearchDoc> = {}): SearchDoc => ({
    type,
    id,
    title,
    body,
    haystack: fold(`${title}\n${body}`),
    tagIds: tagsByItem.get(`${type}:${id}`) ?? new Set(),
    updatedAt: updatedAt ?? '',
    ...extra,
  })
  const bucketName = new Map(data.buckets.map((b) => [b.id, b.name]))
  return [
    ...data.tasks.filter((t) => !t.deleted_at).map((t) => doc('task', t.id, t.title, t.notes ?? '', t.updated_at, { date: t.due_date })),
    ...data.vaultItems
      .filter((v) => !v.deleted_at)
      .map((v) => doc('vault_item', v.id, v.title, [v.notes, v.link].filter(Boolean).join('\n'), v.updated_at, { bucketId: v.bucket_id, context: bucketName.get(v.bucket_id) })),
    ...data.journal
      .filter((j) => !j.deleted_at && (j.body.trim() || j.tomorrow?.trim()))
      .map((j) => doc('journal_entry', j.id, j.date, [plainText(j.body), j.tomorrow?.trim()].filter(Boolean).join('\n'), j.updated_at, { date: j.date })),
    ...data.quests.filter((q) => !q.deleted_at).map((q) => doc('quest', q.id, q.title, q.details ?? '', q.updated_at)),
    ...data.events.filter((e) => !e.deleted_at).map((e) => doc('event', e.id, e.title, e.notes ?? '', e.updated_at, { date: e.start_date })),
  ]
}

/**
 * Items matching every word typed (anywhere in the text) and carrying every chosen tag. Title matches come first,
 * then the most recently changed. With no words and no tags, nothing is listed.
 */
export function search(docs: SearchDoc[], query: string, tagIds: string[] = []): SearchDoc[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length && !tagIds.length) return []
  const hits = docs.filter((d) => words.every((w) => d.haystack.includes(w)) && tagIds.every((t) => d.tagIds.has(t)))
  const inTitle = (d: SearchDoc) => (words.length && words.every((w) => fold(d.title).includes(w)) ? 0 : 1)
  return hits.sort((a, b) => inTitle(a) - inTitle(b) || b.updatedAt.localeCompare(a.updatedAt))
}

/** A short piece of the text around the first word found, for showing under a result. */
export function snippet(doc: SearchDoc, query: string, size = 90): string {
  const text = doc.body.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const words = fold(query).split(/\s+/).filter(Boolean)
  const folded = fold(text)
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0), Infinity)
  if (!Number.isFinite(at) || at < size / 2) return text.length > size ? `${text.slice(0, size).trimEnd()}…` : text
  const start = Math.max(0, at - Math.floor(size / 3))
  const piece = text.slice(start, start + size).trim()
  return `…${piece}${start + size < text.length ? '…' : ''}`
}

export const RESULT_ORDER: TaggedType[] = ['task', 'event', 'journal_entry', 'vault_item', 'quest']
