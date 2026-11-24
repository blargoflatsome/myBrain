// SPEC §5 The Vault, Shared Vaults: which buckets I see, my stars on shared ones, who added what, and clearing this
// device's copy of buckets I can no longer see.
import type { LocalDb } from '@/sync/db'
import { serverList } from '@/server/server'
import type { VaultBucketRow, VaultItemRow, VaultShareRow, VaultStarRow } from '@/sync/types'
import { activeBuckets } from '@/vault/rules'

/** The most people one bucket can be shared with (the server's limit too). */
export const SHARE_LIMIT = 25

/** A bucket is mine when I own it (a bucket made on this device and not yet uploaded is mine too). */
export const ownsBucket = (b: VaultBucketRow, me: string) => !b.user_id || b.user_id === me

/** Buckets shared with me (a live share naming me). */
export function sharedWithMe(shares: VaultShareRow[], me: string): Set<string> {
  return new Set(shares.filter((s) => !s.deleted_at && s.member === me).map((s) => s.bucket_id))
}

/** A row on a shared bucket counts as a star unless it says otherwise (older rows were stars only). */
export const isStar = (s: VaultStarRow) => !s.deleted_at && s.starred !== false

/**
 * The buckets I see, as they're always listed (default, starred, then A to Z): mine, and ones shared with me with my
 * own star and default (both are per person, so a shared bucket's own `starred` and `is_default` are its owner's and
 * are ignored).
 */
export function visibleBuckets(buckets: VaultBucketRow[], shares: VaultShareRow[], stars: VaultStarRow[], me: string): VaultBucketRow[] {
  const shared = sharedWithMe(shares, me)
  const starred = new Set(stars.filter(isStar).map((s) => s.bucket_id))
  const defaults = new Set(stars.filter((s) => !s.deleted_at && s.is_default).map((s) => s.bucket_id))
  return activeBuckets(
    buckets
      .filter((b) => ownsBucket(b, me) || shared.has(b.id))
      .map((b) => (ownsBucket(b, me) ? b : { ...b, starred: starred.has(b.id), is_default: defaults.has(b.id) })),
  )
}

/** Who's sharing my bucket (live shares), for its settings. */
export const membersOf = (shares: VaultShareRow[], bucketId: string) => shares.filter((s) => !s.deleted_at && s.bucket_id === bucketId)

/** "Added by …" shows on items someone else added; never on mine or on items with nobody marked. */
export const addedBySomeoneElse = (item: VaultItemRow, me: string) => !!item.added_by && item.added_by !== me

/** Read the buckets I see, from this device. */
export async function loadVisibleBuckets(db: LocalDb, me: string): Promise<VaultBucketRow[]> {
  const [buckets, shares, stars] = await Promise.all([db.vault_buckets.toArray(), db.vault_shares.toArray(), db.vault_stars.toArray()])
  return visibleBuckets(buckets, shares, stars, me)
}

/**
 * After a pull: remove from this device every bucket I don't own that is no longer shared with me (I left, was taken
 * off, or we're no longer connected), with its items and my star, so nothing of someone else's list stays here.
 * Rows with my changes still waiting to upload are kept until they go.
 */
export async function dropLostBuckets(db: LocalDb, me: string): Promise<void> {
  await db.transaction('rw', [db.vault_buckets, db.vault_items, db.vault_shares, db.vault_stars, db.outbox], async () => {
    const shared = sharedWithMe(await db.vault_shares.toArray(), me)
    const lost = (await db.vault_buckets.toArray()).filter((b) => !ownsBucket(b, me) && !shared.has(b.id)).map((b) => b.id)
    if (!lost.length) return
    const queued = new Set((await db.outbox.toArray()).map((e) => e.rowId))
    const items = (await db.vault_items.where('bucket_id').anyOf(lost).toArray()).filter((i) => !queued.has(i.id))
    await db.vault_items.bulkDelete(items.map((i) => i.id))
    await db.vault_stars.bulkDelete((await db.vault_stars.where('bucket_id').anyOf(lost).toArray()).filter((s) => !queued.has(s.id)).map((s) => s.id))
    await db.vault_buckets.bulkDelete(lost)
  })
}

// ---------- Server calls (online only) ----------

/** A bucket's owner or member, named only when they're me or a connection. */
export interface VaultPerson {
  bucket_id: string
  person: string
  display_name: string | null
  is_owner: boolean
}

// Sharing, unsharing and leaving change my shares and stars, so they're brain actions (src/vault/actions.ts).
export const vaultPeople = () => serverList<VaultPerson>('vault_people')
