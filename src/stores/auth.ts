import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  let ready: Promise<void> | null = null

  const user = computed(() => session.value?.user ?? null)
  const isSignedIn = computed(() => session.value !== null)

  /** Loads the stored session once and keeps it updated. Safe to call many times. */
  function init(): Promise<void> {
    ready ??= (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
      })
    })()
    return ready
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, user, isSignedIn, init, signInWithGoogle, signOut }
})
