// SPEC §7 Lists from the server: what only the server knows (Cheers, Connections, invitees), read through the server
// seam. Like `useRows` for my own rows: it loads when I'm online, again when I come back online or when asked, and
// says how it went, so a failed load never looks like an empty list.
import { ref, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import { useBrainStore } from '@/stores/brain'

/** How a server list is doing: still loading, loaded, couldn't load, or waiting for a connection. */
export type ListState = 'loading' | 'ready' | 'failed' | 'offline'

export interface ServerList<T> {
  /** The list as last loaded (a screen may change it in place after an action). */
  value: Ref<T>
  state: Ref<ListState>
  /** Load it again (after a change, or Try again). Resolves true when it loaded. */
  reload: () => Promise<boolean>
}

/**
 * A list read from the server. `skip` (say, a new event with nobody invited yet) leaves it empty and ready; `follow`
 * reloads it whenever that changes (say, which event is open). A list that loaded before keeps showing while a later
 * load fails.
 */
export function useServerList<T>(load: () => Promise<T>, empty: T, options: { skip?: () => boolean; follow?: WatchSource } = {}): ServerList<T> {
  const brain = useBrainStore()
  const value = shallowRef(empty) as Ref<T>
  const state = ref<ListState>('loading')
  let latest = 0

  async function reload() {
    if (options.skip?.()) {
      value.value = empty
      state.value = 'ready'
      return true
    }
    if (!brain.online) {
      if (state.value !== 'ready') state.value = 'offline'
      return false
    }
    const mine = ++latest
    if (state.value !== 'ready') state.value = 'loading'
    try {
      const next = await load()
      if (mine !== latest) return false
      value.value = next
      state.value = 'ready'
      return true
    } catch (err) {
      console.error(err)
      if (mine === latest) state.value = 'failed'
      return false
    }
  }

  watch([() => brain.online, ...(options.follow ? [options.follow] : [])], (now, before: unknown[] | undefined) => {
    // The first run (Vue gives an empty list as "before" then) always loads, or says it's waiting to be online.
    const first = !before?.length
    // Following something else (another event): what was shown was for the old one.
    if (!first && now[1] !== before![1]) {
      value.value = empty
      state.value = 'loading'
    } else if (!first && !now[0]) return // going offline changes nothing shown
    void reload()
  }, { immediate: true })

  return { value, state, reload }
}
