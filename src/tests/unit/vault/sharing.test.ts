import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { LocalDb } from '@/sync/db'
import type { VaultBucketRow, VaultShareRow, VaultStarRow } from '@/sync/types'
import { dropLostBuckets, visibleBuckets } from '@/vault/sharing'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const ME = 'me'
const bucket = (id: string, user_id: string, extra: Partial<VaultBucketRow> = {}): VaultBucketRow => ({ id, user_id, name: id, position: 0, deleted_at: null, ...extra })
const share = (bucket_id: string, member: string, deleted_at: string | null = null): VaultShareRow => ({ id: `s-${bucket_id}-${member}`, user_id: 'alice', bucket_id, member, deleted_at })
const star = (bucket_id: string): VaultStarRow => ({ id: `st-${bucket_id}`, user_id: ME, bucket_id, deleted_at: null })

describe('SPEC §5 Shared Vaults: the buckets I see', () => {
  it('mine and ones shared with me; never a bucket shared with someone else or no longer shared with me', () => {
    const buckets = [bucket('mine', ME), bucket('groceries', 'alice'), bucket('theirs', 'alice'), bucket('left', 'alice'), bucket('local', '')]
    const shares = [share('groceries', ME), share('theirs', 'bob'), share('left', ME, '2026-11-18T00:00:00Z')]
    expect(visibleBuckets(buckets, shares, [], ME).map((b) => b.id).sort()).toEqual(['groceries', 'local', 'mine'])
  })

  it('stars are per person: a shared bucket shows my star, not its owner’s', () => {
    const buckets = [bucket('a-groceries', 'alice', { starred: true }), bucket('b-books', 'alice'), bucket('c-mine', ME)]
    const shares = [share('a-groceries', ME), share('b-books', ME)]
    const shown = visibleBuckets(buckets, shares, [star('b-books')], ME)
    expect(shown.map((b) => [b.id, !!b.starred])).toEqual([['b-books', true], ['a-groceries', false], ['c-mine', false]])
  })

  it('my default on a shared bucket is mine, not its owner’s, and a default-only row is no star (SPEC §5 Default bucket)', () => {
    const buckets = [bucket('a-owners-default', 'alice', { is_default: true }), bucket('b-my-default', 'alice'), bucket('c-mine', ME)]
    const shares = [share('a-owners-default', ME), share('b-my-default', ME)]
    const shown = visibleBuckets(buckets, shares, [{ ...star('b-my-default'), starred: false, is_default: true }], ME)
    expect(shown.map((b) => [b.id, !!b.is_default, !!b.starred])).toEqual([['b-my-default', true, false], ['a-owners-default', false, false], ['c-mine', false, false]])
  })
})

describe('SPEC §5 Shared Vaults: losing access removes this device’s copy', () => {
  it('a bucket no longer shared with me goes, with its items and my star; mine and still-shared ones stay', async () => {
    const db = new LocalDb('drop-lost-test')
    await db.vault_buckets.bulkPut([bucket('mine', ME), bucket('kept', 'alice'), bucket('lost', 'alice')])
    await db.vault_shares.bulkPut([share('kept', ME), share('lost', ME, '2026-11-18T00:00:00Z')])
    await db.vault_items.bulkPut([
      { id: 'i1', user_id: 'alice', bucket_id: 'lost', title: 'Milk', deleted_at: null },
      { id: 'i2', user_id: 'alice', bucket_id: 'lost', title: 'Eggs I just added', deleted_at: null },
      { id: 'i3', user_id: 'alice', bucket_id: 'kept', title: 'Bread', deleted_at: null },
    ])
    await db.vault_stars.put(star('lost'))
    // An item with my change still waiting to upload stays until it goes.
    await db.outbox.add({ table: 'vault_items', rowId: 'i2', row: { id: 'i2' } as never })

    await dropLostBuckets(db, ME)

    expect((await db.vault_buckets.toArray()).map((b) => b.id).sort()).toEqual(['kept', 'mine'])
    expect((await db.vault_items.toArray()).map((i) => i.id).sort()).toEqual(['i2', 'i3'])
    expect(await db.vault_stars.count()).toBe(0)
    db.close()
  })
})
