import { describe, expect, it } from 'vitest'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { favoriteBuckets } from '@/dashboard/stats'

describe('Spec §5 The Vault: favorite buckets on the Dashboard', () => {
  it('each starred bucket, A to Z, with its 3 newest items', () => {
    const buckets: VaultBucketRow[] = [
      { id: 'b2', name: 'Books', position: 1, starred: true, deleted_at: null },
      { id: 'b1', name: 'Shopping', position: 0, starred: true, deleted_at: null },
      { id: 'b3', name: 'Ideas', position: 2, starred: false, deleted_at: null },
    ]
    const items: VaultItemRow[] = ['a', 'b', 'c', 'd'].map((t, i) => ({ id: t, bucket_id: 'b2', title: t, created_at: `2026-11-0${i + 1}`, deleted_at: null }))
    const out = favoriteBuckets(buckets, items)
    expect(out.map((f) => f.bucket.name)).toEqual(['Books', 'Shopping'])
    expect(out[0]!.newest.map((i) => i.title)).toEqual(['d', 'c', 'b'])
  })
})

