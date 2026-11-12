import { describe, expect, it } from 'vitest'
import { activeBuckets } from '@/vault/rules'
import type { VaultBucketRow } from '@/sync/types'

describe('Spec §5 The Vault: buckets are always favorites first, then A to Z', () => {
  it('starred buckets come first, each group sorted by name (ignoring case), deleted ones left out', () => {
    const b = (id: string, name: string, starred: boolean, extra: Partial<VaultBucketRow> = {}): VaultBucketRow => ({ id, name, position: 0, starred, deleted_at: null, ...extra })
    const out = activeBuckets([b('1', 'shopping', false), b('2', 'Zoo trips', true), b('3', 'Books', false), b('4', 'art', true), b('5', 'Gone', true, { deleted_at: 'x' })])
    expect(out.map((x) => x.name)).toEqual(['art', 'Zoo trips', 'Books', 'shopping'])
  })
})

