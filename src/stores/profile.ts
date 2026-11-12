import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { readJson, writeJson } from '@/ui/storage'
import { parseAppearance, setAppearance } from '@/ui/appearance'

/** The columns of my profile the app reads (SPEC §4 profiles). */
export interface Profile {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  streak_visibility: 'private' | 'approved'
  celebrations: string | null
  /** SPEC §3 Appearance: system, light or dark. */
  appearance: string | null
  timezone: string
  phone: string | null
  phone_verified: boolean
  event_notify_method: string | null
  share_availability: boolean | null
  cancel_event_message: string | null
  cancel_dropout_message: string | null
  notify_ntfy: boolean | null
  ntfy_topic: string | null
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  quiet_hours_silence_priority: boolean | null
  journal_reminder_time: string | null
  data_reset_at: string | null
}

/** What I see of my profile before the server answers, or offline: my name and picture. */
export type ProfileShown = Pick<Profile, 'user_id' | 'display_name' | 'avatar_url'>

const CACHE_KEY = 'my-brain:profile'

/**
 * My profile (SPEC §5 Account page, §2 Header), read from the server once per session and shared by every screen.
 * Only my name and picture are kept on this device (so the header has them offline); settings such as the ntfy
 * topic are not, and are cleared with everything else on sign-out.
 */
export const useProfileStore = defineStore('profile', () => {
  const auth = useAuthStore()
  /** My name and picture: the last copy on this device until the server answers. */
  const shown = ref<ProfileShown | null>(null)
  let full: Profile | null = null
  let loading: Promise<Profile | null> | null = null
  let loadedFor: string | null = null

  function keep(next: Profile) {
    full = next
    // SPEC §3 Appearance: my saved choice follows me to every device.
    if (next.appearance !== undefined) setAppearance(parseAppearance(next.appearance))
    shown.value = { user_id: next.user_id, display_name: next.display_name, avatar_url: next.avatar_url }
    writeJson(CACHE_KEY, shown.value)
  }

  /** Start over for whoever is signed in now; shows their saved name and picture straight away. */
  function follow(uid: string | null) {
    if (loadedFor === uid) return
    loadedFor = uid
    loading = null
    full = null
    const saved = readJson<ProfileShown>(CACHE_KEY)
    shown.value = uid && saved?.user_id === uid ? saved : null
  }

  /** My whole profile from the server (once per session), or null when it can't be read (offline). */
  function load(): Promise<Profile | null> {
    const uid = auth.user?.id ?? null
    follow(uid)
    if (!uid) return Promise.resolve(null)
    if (full) return Promise.resolve(full)
    loading ??= (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle()
      if (loadedFor !== uid) return null
      if (error || !data) {
        loading = null // try again next time
        return null
      }
      keep(data as Profile)
      return full
    })()
    return loading
  }

  /** Save some fields of my profile; false when it failed (for example offline). */
  async function update(fields: Partial<Omit<Profile, 'user_id'>>): Promise<boolean> {
    const uid = auth.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profiles').update(fields).eq('user_id', uid)
    if (error) return false
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    if (full && loadedFor === uid) keep({ ...full, ...given })
    return true
  }

  return { shown, load, update, follow }
})
