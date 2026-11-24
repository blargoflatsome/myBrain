// SPEC §5 Shared Vaults: the buckets I see (mine and ones shared with me, with my own star and default), live.
import type { Ref } from 'vue'
import type { VaultBucketRow } from '@/sync/types'
import { useDeviceQuery } from '@/sync/useRows'
import { loadVisibleBuckets } from '@/vault/sharing'

/** The buckets I see, as they're always listed; follows the device. */
export function useVisibleBuckets(): Ref<VaultBucketRow[]> {
  return useDeviceQuery<VaultBucketRow[]>((db, me) => loadVisibleBuckets(db, me), [])
}
