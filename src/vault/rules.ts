// The Vault rules (SPEC §5 The Vault): bucket order, items in a bucket, check-off, links.
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'

export function activeBuckets(buckets: VaultBucketRow[]): VaultBucketRow[] {
  return buckets.filter((b) => !b.deleted_at).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

/** A bucket's items in the order they were added; in a checklist bucket, checked items go to the bottom. */
export function itemsInBucket(items: VaultItemRow[], bucket: VaultBucketRow): VaultItemRow[] {
  const mine = items.filter((i) => i.bucket_id === bucket.id && !i.deleted_at)
  const byAdded = (a: VaultItemRow, b: VaultItemRow) => (a.created_at ?? '').localeCompare(b.created_at ?? '')
  if (!bucket.checkable) return mine.sort(byAdded)
  return [...mine.filter((i) => !i.checked).sort(byAdded), ...mine.filter((i) => i.checked).sort(byAdded)]
}

export function checkedItems(items: VaultItemRow[], bucket: VaultBucketRow): VaultItemRow[] {
  return bucket.checkable ? items.filter((i) => i.bucket_id === bucket.id && !i.deleted_at && i.checked) : []
}

const URLISH = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/

/** Where a link or address opens: a web address opens as is; anything else is looked up in maps. */
export function linkTarget(link: string): { href: string; kind: 'web' | 'map' } {
  const text = link.trim()
  if (/^https?:\/\//i.test(text)) return { href: text, kind: 'web' }
  if (URLISH.test(text)) return { href: `https://${text}`, kind: 'web' }
  return { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`, kind: 'map' }
}

/** A short label for a link: the site name for web addresses, the address itself otherwise. */
export function linkLabel(link: string): string {
  const target = linkTarget(link)
  if (target.kind === 'map') return link.trim()
  try {
    return new URL(target.href).hostname.replace(/^www\./, '')
  } catch {
    return link.trim()
  }
}

export function clampRating(value: number | null | undefined): number | null {
  if (!value) return null
  return Math.min(5, Math.max(1, Math.round(value)))
}
