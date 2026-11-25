// SPEC §8 Auth: what the signed-in session needs from Supabase (sign-in, signing out, my profile row, the sync
// Remote, this device's push subscription), behind one seam so tests use a fake (src/tests/support/fakeSession.ts).
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/stores/profile'
import type { Remote } from '@/sync/types'
// Up front (it needs no keys): loaded on first use, it held up syncing by a download, and a failed download stopped it.
import { supabaseRemote } from '@/sync/supabaseRemote'

export interface SessionAdapter {
  /** The stored sign-in, if any. */
  getSession(): Promise<Session | null>
  /** Calls back whenever the sign-in changes (signed in, refreshed, signed out). */
  onChange(listener: (session: Session | null) => void): void
  signInWithGoogle(): Promise<void>
  /** `local` signs out this device only (the account is already gone). */
  signOut(scope: 'global' | 'local'): Promise<void>
  /** My profile row, read fresh; null when it can't be read (offline). */
  readProfile(uid: string): Promise<Profile | null>
  /** Where this user's rows sync to. */
  remote(): Promise<Remote>
  /** Stop push notifications to this device. */
  forgetPush(): Promise<void>
}

// Supabase is loaded on first use, so unit tests with a fake never need its keys.
const client = async () => (await import('@/lib/supabase')).supabase

const supabaseSession: SessionAdapter = {
  async getSession() {
    return (await (await client()).auth.getSession()).data.session
  },
  onChange(listener) {
    void client().then((c) => c.auth.onAuthStateChange((_event, next) => listener(next)))
  },
  async signInWithGoogle() {
    const { error } = await (await client()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) throw error
  },
  async signOut(scope) {
    await (await client()).auth.signOut({ scope })
  },
  async readProfile(uid) {
    const { data, error } = await (await client()).from('profiles').select('*').eq('user_id', uid).maybeSingle()
    return error || !data ? null : (data as Profile)
  },
  async remote() {
    return supabaseRemote(await client())
  },
  async forgetPush() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await (await reg?.pushManager.getSubscription())?.unsubscribe()
    } catch {
      // No push on this device.
    }
  },
}

let adapter = supabaseSession

/** The adapter in use (Supabase unless a test swapped it). */
export const sessionAdapter = () => adapter

/** Use another adapter (tests); returns a function that puts Supabase back. */
export function useSessionAdapter(next: SessionAdapter): () => void {
  adapter = next
  return () => {
    adapter = supabaseSession
  }
}
