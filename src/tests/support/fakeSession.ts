// Stand-in for Supabase sign-in (src/session/adapter.ts), used by tests: my profile row is whatever the test sets,
// rows sync to the given FakeRemote, and sign-outs and push are recorded.
import type { Session } from '@supabase/supabase-js'
import { useSessionAdapter, type SessionAdapter } from '@/session/adapter'
import type { Profile } from '@/stores/profile'
import { useAuthStore } from '@/stores/auth'
import { deviceTimeZone } from '@/time/days'
import { ServerError, type ServerReason } from '@/server/server'
import type { FakeRemote } from './fakeRemote'

export class FakeSession implements SessionAdapter {
  /** My profile on the server; null reads as offline. The timezone matches the device, so nothing is saved back. */
  profile: Partial<Profile> | null = { timezone: deviceTimeZone(), phone: '+15555550100', data_reset_at: null, celebrations: null }
  readonly signedOut: ('global' | 'local')[] = []
  pushForgotten = false
  /** Every profile save that went through, in order. */
  readonly profileSaves: Partial<Profile>[] = []
  /** Set to make profile saves fail for this reason. */
  failProfileSaves: ServerReason | null = null

  constructor(private readonly rows: FakeRemote) {}

  async getSession() {
    return null
  }
  onChange() {}
  async signInWithGoogle() {}
  async signOut(scope: 'global' | 'local') {
    this.signedOut.push(scope)
  }
  async readProfile(uid: string) {
    return this.profile ? ({ user_id: uid, display_name: 'Test Person', avatar_url: null, ...this.profile } as Profile) : null
  }
  async updateProfile(_uid: string, fields: Partial<Profile>) {
    if (this.failProfileSaves) throw new ServerError(this.failProfileSaves)
    this.profileSaves.push(fields)
    if (this.profile) Object.assign(this.profile, fields)
  }
  async remote() {
    return this.rows
  }
  async forgetPush() {
    this.pushForgotten = true
  }

  /** Send the session's calls here until the returned function is called. */
  use(): () => void {
    return useSessionAdapter(this)
  }

  /** Sign in as `uid`, as a stored Supabase session would. */
  signIn(uid: string) {
    useAuthStore().session = { user: { id: uid } } as Session
  }
}
