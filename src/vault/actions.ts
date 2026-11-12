// Reading and writing Vault buckets and items (SPEC §5 The Vault).
import type { VaultItemRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { buildBucket } from '@/capture/capture'
import { live } from '@/sync/live'
import { achieved } from '@/celebrate/bus'

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

  return { createBucket, deleteBucket, addVaultItem, saveVaultItem, toggleVaultItem, clearChecked }
}
