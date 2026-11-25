// Reading and writing Vault buckets and items (SPEC §5 The Vault).
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { removeWithUndo, type ActionContext } from '@/sync/actions'
import { getRow } from '@/sync/db'
import { buildBucket } from '@/capture/capture'
import { live } from '@/sync/live'
import { achieved } from '@/celebrate/bus'
import { isStar, ownsBucket } from '@/vault/sharing'
import { clampRating } from '@/vault/rules'
import { clipTitle } from '@/lib/titles'

/** A new Vault item as Capture, Orphans or a bucket's add box gives it. */
export type VaultItemDraft = Partial<Pick<VaultItemRow, 'notes' | 'rating' | 'link'>> & { title: string }

export function vaultActions({ ready, onServer }: ActionContext) {
  async function createBucket(name: string) {
    const { engine: e, uid, local } = ready()
    const last = await local.vault_buckets.orderBy('position').last()
    const bucket = buildBucket(name, (last?.position ?? -1) + 1, uid)
    await e.save('vault_buckets', bucket)
    return bucket
  }

  /** Delete a bucket and the items in it (the caller has already confirmed). */
  async function deleteBucket(id: string) {
    const { engine: e, local } = ready()
    await e.removeMany('vault_items', live(await local.vault_items.where('bucket_id').equals(id).toArray()).map((i) => i.id))
    await e.remove('vault_buckets', id)
  }

  /** Save something to the Vault (SPEC §5 The Vault). Returns null when it has no name. */
  async function addVaultItem(bucketId: string, draft: VaultItemDraft, now = new Date()) {
    const { engine: e, uid } = ready()
    const title = clipTitle(draft.title)
    if (!title) return null
    const saved = await e.save('vault_items', {
      id: crypto.randomUUID(),
      user_id: uid,
      bucket_id: bucketId,
      title,
      notes: draft.notes?.trim() || null,
      rating: clampRating(draft.rating),
      link: draft.link?.trim() || null,
      checked: false,
      // Set here too, so items keep the order they were added in before they reach the server.
      created_at: now.toISOString(),
      deleted_at: null,
    })
    achieved({ kind: 'vault' })
    return saved
  }

  async function saveVaultItem(row: VaultItemRow) {
    const { engine: e, uid, local } = ready()
    const isNew = !(await local.vault_items.get(row.id))
    const saved = await e.save('vault_items', { ...row, user_id: uid })
    if (isNew) achieved({ kind: 'vault' })
    return saved
  }

  /** Delete one item. Returns its Undo (SPEC §2). */
  const deleteVaultItem = (id: string) => removeWithUndo(ready, 'vault_items', [id])

  /**
   * Star or unstar a bucket (SPEC §5 The Vault, Shared Vaults): my own bucket keeps its star on itself; a bucket shared
   * with me keeps my star on my own row, the one that also holds my default, so the owner's star is never changed.
   */
  async function toggleStar(bucketId: string) {
    const { engine: e, uid, local } = ready()
    const bucket = await getRow(local, 'vault_buckets', bucketId)
    if (!bucket) return
    if (ownsBucket(bucket, uid)) {
      await e.save('vault_buckets', { ...bucket, starred: !bucket.starred })
      return
    }
    const mine = (await local.vault_stars.where('bucket_id').equals(bucketId).toArray()).find((s) => s.user_id === uid || !s.user_id)
    if (mine) await e.save('vault_stars', { ...mine, starred: !isStar(mine), is_default: !mine.deleted_at && !!mine.is_default, deleted_at: null })
    else await e.save('vault_stars', { id: crypto.randomUUID(), user_id: uid, bucket_id: bucketId, starred: true, is_default: false, deleted_at: null })
  }

  /** Save a bucket's settings (name, checklist, default). There's only one default, so ticking it moves it here. */
  async function saveBucket(row: VaultBucketRow) {
    const { engine: e, uid, local } = ready()
    const was = !!(await local.vault_buckets.get(row.id))?.is_default
    await e.save('vault_buckets', { ...row, user_id: uid, is_default: was })
    if (!!row.is_default !== was) await setDefaultBucket(row.is_default ? row.id : null)
  }

  async function toggleVaultItem(id: string) {
    await ready().engine.patch('vault_items', id, (fresh) => ({ checked: !fresh.checked }))
  }

  /** "Clear checked": delete the checked items in a checklist bucket, straight away; returns how many, and their Undo (SPEC §2). */
  async function clearChecked(bucketId: string) {
    const { local } = ready()
    const cleared = (await local.vault_items.where('bucket_id').equals(bucketId).toArray()).filter((i) => !i.deleted_at && i.checked)
    return { count: cleared.length, undo: await removeWithUndo(ready, 'vault_items', cleared.map((i) => i.id)) }
  }

  /**
   * Make a bucket my default, or have none (SPEC §5 The Vault, Default bucket). There's only one, so the old default
   * is cleared in the same go, without asking. Mine is kept on my own bucket, or on my row for a shared one.
   */
  async function setDefaultBucket(bucketId: string | null) {
    const { engine: e, uid, local } = ready()
    for (const b of live(await local.vault_buckets.toArray())) {
      if (ownsBucket(b, uid) && b.is_default && b.id !== bucketId) await e.save('vault_buckets', { ...b, is_default: false })
    }
    const rows = await local.vault_stars.toArray()
    for (const r of rows) {
      if (r.is_default && r.bucket_id !== bucketId) await e.save('vault_stars', { ...r, is_default: false })
    }
    if (!bucketId) return
    const bucket = await getRow(local, 'vault_buckets', bucketId)
    if (!bucket) return
    if (ownsBucket(bucket, uid)) {
      await e.save('vault_buckets', { ...bucket, is_default: true })
      return
    }
    const mine = rows.find((r) => r.bucket_id === bucketId)
    // A row that only held a star I took back is brought back unstarred, so making it my default adds no star.
    if (mine) await e.save('vault_stars', { ...mine, starred: mine.deleted_at ? false : mine.starred !== false, is_default: true, deleted_at: null })
    else await e.save('vault_stars', { id: crypto.randomUUID(), user_id: uid, bucket_id: bucketId, starred: false, is_default: true, deleted_at: null })
  }

  // ---------- Shared Vaults (server calls, online only; SPEC §5 The Vault, Shared Vaults) ----------
  const shareBucket = (bucket: string, friend: string) => onServer('share_vault_bucket', { bucket, friend }, ['vault_shares'])
  const unshareBucket = (bucket: string, friend: string) => onServer('unshare_vault_bucket', { bucket, friend }, ['vault_shares', 'vault_stars'])
  /** Leave a bucket shared with me; it goes from this device with my star (dropLostBuckets, after the download). */
  const leaveBucket = (bucket: string) => onServer('leave_vault_bucket', { bucket }, ['vault_shares', 'vault_stars'])

  return { shareBucket, unshareBucket, leaveBucket, setDefaultBucket, createBucket, deleteBucket, addVaultItem, saveVaultItem, deleteVaultItem, toggleStar, saveBucket, toggleVaultItem, clearChecked }
}
