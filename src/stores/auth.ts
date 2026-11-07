import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import Dexie from 'dexie'
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

  /**
   * SPEC §9 / §5 Account page: permanently delete my account and everything in it on the server, then clear this
   * device (its stored copy and its push subscription) and sign out. Needs a connection; returns false if it failed.
   */
  async function deleteAccount(): Promise<boolean> {
    const uid = user.value?.id
    if (!uid) return false
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return false
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await (await reg?.pushManager.getSubscription())?.unsubscribe()
    } catch {
      // No push on this device.
    }
    await Dexie.delete(`my-brain-${uid}`).catch(() => {})
    await supabase.auth.signOut({ scope: 'local' })
    session.value = null
    return true
  }

  return { session, user, isSignedIn, init, signInWithGoogle, signOut, deleteAccount }
})
