import { liveQuery } from 'dexie'
import { onScopeDispose, shallowRef, watch, type Ref, type WatchSource } from 'vue'

/** A Vue ref that follows a Dexie query and updates whenever the on-device data changes (SPEC §7: reads come from the local store). */
export function useLiveQuery<T>(query: () => Promise<T> | T, initial: T, deps: WatchSource[] = []): Ref<T> {
  // Shallow: each change replaces the whole result, so making every row of it reactive would be wasted work.
  const result = shallowRef(initial) as Ref<T>
  let sub: { unsubscribe(): void } | null = null

  const run = () => {
    sub?.unsubscribe()
    sub = liveQuery(query).subscribe({
      next: (value) => (result.value = value),
      error: (err) => console.error(err),
    })
  }

  if (deps.length) watch(deps, run, { immediate: true })
  else run()
  onScopeDispose(() => sub?.unsubscribe())
  return result
}
