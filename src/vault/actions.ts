// Reading and writing Vault buckets and items (SPEC §5 The Vault).
import type { VaultItemRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { buildBucket } from '@/capture/capture'
import { live } from '@/sync/live'
import { achieved } from '@/celebrate/bus'
import { ownsBucket } from '@/vault/sharing'

export function vaultActions({ ready }: ActionContext) {
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

  async function addVaultItem(bucketId: string, title: string) {
    const { engine: e, uid } = ready()
    const trimmed = title.trim()
    if (!trimmed) return null
    // created_at is set here too, so items keep the order they were added in before they reach the server.
    const saved = await e.save('vault_items', { id: crypto.randomUUID(), user_id: uid, bucket_id: bucketId, title: trimmed, notes: null, rating: null, link: null, checked: false, created_at: new Date().toISOString(), deleted_at: null })
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

  async function toggleVaultItem(id: string) {
    await ready().engine.patch('vault_items', id, (fresh) => ({ checked: !fresh.checked }))
  }

  /** "Clear checked": delete the checked items in a checklist bucket (the caller has already confirmed). */
  async function clearChecked(bucketId: string) {
    const { engine: e, local } = ready()
    const cleared = (await local.vault_items.where('bucket_id').equals(bucketId).toArray()).filter((i) => !i.deleted_at && i.checked)
    await e.removeMany('vault_items', cleared.map((i) => i.id))
    return cleared.map((i) => i.id)
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
    const bucket = await local.vault_buckets.get(bucketId)
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

  return { setDefaultBucket, createBucket, deleteBucket, addVaultItem, saveVaultItem, toggleVaultItem, clearChecked }
}
