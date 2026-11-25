import { reactive, ref } from 'vue'
import { messages } from '@/messages'
import { notSaved, useProfileStore, type Profile } from '@/stores/profile'
import type { ServerReason } from '@/server/server'

/**
 * Saving a setting, or a group of them, with its quiet note (SPEC §5 Account page): the last note goes, the save runs,
 * then the note says Saved, or why it didn't save (offline, or it failed, which includes a save that throws).
 * `failed` says which, for a screen that shows a failure as an alert. When saves overlap, the latest one's answer
 * is the one shown.
 */
export function useSettingSave() {
  const notice = ref('')
  const failed = ref(false)
  const saving = ref(false)
  let latest = 0

  /** Runs the save and shows its note; true when it saved. */
  async function save(run: () => Promise<ServerReason | null | void>): Promise<boolean> {
    const mine = ++latest
    notice.value = ''
    failed.value = false
    saving.value = true
    let why: ServerReason | null
    try {
      why = (await run()) ?? null
    } catch (err) {
      console.error(err)
      why = 'failed'
    }
    if (mine !== latest) return !why
    saving.value = false
    failed.value = why !== null
    notice.value = why ? notSaved(why, messages.profile.offline) : messages.profile.saved
    return !why
  }

  /** Takes the note away, for a save refused before it ran (a check on the screen); a save still running stays quiet. */
  function clear() {
    latest++
    notice.value = ''
    failed.value = false
    saving.value = false
  }

  /** Saves these fields of my profile and shows the note; true when they saved. */
  const saveProfile = (fields: Partial<Omit<Profile, 'user_id'>>) => save(() => useProfileStore().update(fields))

  return reactive({ notice, failed, saving, save, saveProfile, clear })
}
