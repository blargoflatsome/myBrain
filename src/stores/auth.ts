// SPEC §8 Auth: who is signed in. What happens around signing in and out (syncing, clearing this device, deleting
// the account) is the session store's (src/stores/session.ts).
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { sessionAdapter } from '@/session/adapter'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  let ready: Promise<void> | null = null

  const user = computed(() => session.value?.user ?? null)
  const isSignedIn = computed(() => session.value !== null)

  /** Loads the stored session once and keeps it updated. Safe to call many times. */
  function init(): Promise<void> {
    ready ??= (async () => {
      const adapter = sessionAdapter()
      session.value = await adapter.getSession()
      adapter.onChange((next) => {
        session.value = next
      })
    })()
    return ready
  }

  const signInWithGoogle = () => sessionAdapter().signInWithGoogle()

  /** Sign out on the server (`global`) or, once the account is gone, on this device only (`local`). */
  async function signOut(scope: 'global' | 'local' = 'global') {
    await sessionAdapter().signOut(scope)
    session.value = null
  }

  return { session, user, isSignedIn, init, signInWithGoogle, signOut }
})
