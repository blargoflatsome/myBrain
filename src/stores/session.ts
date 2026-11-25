// SPEC §8 Auth, §5 Account page: the signed-in session from start to finish. It follows sign-in (opens my data and
// starts syncing, reads my profile once, keeps up with Delete my data done on another device), and does the whole of
// signing out, Delete my data and Delete My Account, so screens only show windows and route.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import Dexie from 'dexie'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { useProfileStore } from '@/stores/profile'
import { sessionAdapter } from '@/session/adapter'
import { serverCall } from '@/server/server'
import { deviceTimeZone } from '@/tasks/days'
import { clearAppKeys } from '@/ui/storage'

/** Coming back to the app checks for Delete my data on another device at most this often. */
const RESET_CHECK_MS = 60_000

export const useSessionStore = defineStore('session', () => {
  const auth = useAuthStore()
  const brain = useBrainStore()
  const profile = useProfileStore()

  /** SPEC §5 Accounts: my profile has no phone number yet, so it's asked for once (App.vue routes). */
  const needsPhone = ref(false)
  let lastResetCheck = 0
  let begun = false
  /** Whose data is open and syncing; a start that failed (a download that didn't arrive) is tried again on return. */
  let startedFor: string | null = null

  /** SPEC §8 Delete my data: if it was done on another device, clear this device's copy and download again. */
  async function checkDataReset(): Promise<boolean> {
    const uid = auth.user?.id
    if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) return false
    lastResetCheck = Date.now()
    // Read fresh, not the profile store's copy: the point is to see a change made since.
    const row = await sessionAdapter().readProfile(uid)
    return brain.applyDataReset(row?.data_reset_at)
  }

  async function signedIn(uid: string) {
    const remote = await sessionAdapter().remote()
    if (auth.user?.id !== uid) return
    brain.start(uid, remote)
    startedFor = uid
    lastResetCheck = Date.now()
    // One read of my profile, shared by every screen.
    const data = await profile.load()
    if (auth.user?.id !== uid || !data) return
    // SPEC §5 Tasks: keep the profile's timezone in step with the device, for server-side jobs.
    if (data.timezone !== deviceTimeZone()) void profile.update({ timezone: deviceTimeZone() })
    await brain.applyDataReset(data.data_reset_at)
    needsPhone.value = !data.phone
  }

  /** Follow sign-in for the rest of the visit (once, from App.vue). */
  function begin() {
    if (begun) return
    begun = true
    watch(
      () => auth.user?.id,
      (uid) => {
        profile.follow(uid ?? null)
        needsPhone.value = false
        startedFor = null
        if (!uid) return brain.stop()
        void signedIn(uid).catch((err: unknown) => console.error(err))
      },
      { immediate: true },
    )
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const uid = auth.user?.id
      if (uid && startedFor !== uid) return void signedIn(uid).catch((err: unknown) => console.error(err))
      if (Date.now() - lastResetCheck > RESET_CHECK_MS) void checkDataReset().catch(() => {})
    })
  }

  /** Delete this device's copy of my data and everything the app remembered here (SPEC §8: nothing of mine stays). */
  async function forgetThisDevice() {
    await brain.forgetDevice()
    clearAppKeys()
  }

  /**
   * SPEC §8 Sign out: upload what's waiting first. Returns how many of my changes couldn't upload (offline), without
   * signing out, unless `discardUnsent` says to throw them away; 0 once signed out.
   */
  async function signOut(discardUnsent = false): Promise<number> {
    if (!discardUnsent) {
      const unsent = await brain.uploadBeforeSignOut()
      if (unsent > 0) return unsent
    }
    await forgetThisDevice()
    await auth.signOut()
    return 0
  }

  /**
   * SPEC §5 Account page, §8 Delete My Account: delete it and everything in it on the server, then clear this device
   * and sign out. False if it failed (offline, say), and then nothing was deleted and syncing carries on.
   */
  async function deleteAccount(): Promise<boolean> {
    const uid = auth.user?.id
    if (!uid) return false
    // Nothing syncs while the account goes, so no upload brings rows back.
    brain.stop()
    try {
      await serverCall('delete_my_account')
    } catch {
      if (auth.user?.id === uid) brain.start(uid, await sessionAdapter().remote())
      return false
    }
    await sessionAdapter().forgetPush()
    await Dexie.delete(`my-brain-${uid}`).catch(() => {})
    clearAppKeys()
    await auth.signOut('local')
    return true
  }

  /** SPEC §8 Delete my data: delete the chosen parts on the server, then start this device's copy over. */
  async function deleteMyData(parts: string[]): Promise<boolean> {
    let resetAt: string | null
    try {
      resetAt = await serverCall<string | null>('delete_my_data', { parts })
    } catch {
      return false
    }
    await brain.applyDataReset(resetAt ?? new Date().toISOString())
    return true
  }

  return { needsPhone, begin, checkDataReset, signOut, deleteAccount, deleteMyData }
})
