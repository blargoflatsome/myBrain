<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-28">
    <div class="flex items-center gap-4">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" class="size-16 rounded-full border border-line" referrerpolicy="no-referrer">
      <div v-else class="flex size-16 items-center justify-center rounded-full bg-surface text-2xl" aria-hidden="true">🙂</div>
      <h1 class="text-2xl font-bold">{{ displayName || m.heading }}</h1>
    </div>

    <section class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" data-testid="profile-settings">
      <h2 class="text-lg font-semibold">{{ m.settingsHeading }}</h2>
      <form v-if="loaded" class="flex flex-col gap-4" @submit.prevent="save">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.displayName }}
          <input v-model="displayName" maxlength="120" :class="field">
        </label>
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.visibility }}
          <select v-model="visibility" :class="field">
            <option v-for="v in visibilities" :key="v" :value="v">{{ m.visibilityOptions[v] }}</option>
          </select>
          <span class="text-xs">{{ m.visibilityHint }}</span>
        </label>
        <div class="flex items-center gap-3">
          <button type="submit" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" :disabled="saving">{{ m.save }}</button>
          <p v-if="notice" role="status" class="text-sm text-muted">{{ notice }}</p>
        </div>
      </form>
      <p v-else class="text-muted">{{ m.offline }}</p>
    </section>

    <NotificationSettings />

    <EventSettings />

    <MyPeople />

    <section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" data-testid="data-export">
      <div>
        <h2 class="text-lg font-semibold">{{ messages.dataExport.heading }}</h2>
        <p class="text-sm text-muted">{{ messages.dataExport.body }}</p>
      </div>
      <button type="button" class="min-h-11 self-start rounded-xl border border-line px-4" :disabled="exporting" @click="exportData">
        {{ exporting ? messages.dataExport.working : messages.dataExport.button }}
      </button>
      <p v-if="exportError" class="text-sm text-danger" role="alert">{{ exportError }}</p>
      <div class="flex flex-col gap-1 border-t border-line pt-3">
        <button type="button" class="min-h-11 self-start rounded-xl border border-danger px-4 font-semibold text-danger" @click="askWipe">
          {{ messages.deleteData.button }}
        </button>
        <p class="text-xs text-muted">{{ messages.deleteData.hint }}</p>
        <p v-if="wipeDone" class="text-sm" role="status">{{ wipeDone }}</p>
      </div>
      <p class="flex gap-4 text-sm">
        <RouterLink to="/docs" class="text-muted underline">{{ messages.legal.docs }}</RouterLink>
        <RouterLink to="/privacy" class="text-muted underline">{{ messages.legal.privacy }}</RouterLink>
        <RouterLink to="/terms" class="text-muted underline">{{ messages.legal.terms }}</RouterLink>
      </p>
    </section>

    <button type="button" class="min-h-12 rounded-xl border border-line px-4 text-muted" @click="signOut">{{ messages.signOut.button }}</button>

    <section class="flex flex-col gap-3 rounded-2xl border border-danger/40 p-4" data-testid="delete-account">
      <div>
        <h2 class="text-lg font-semibold">{{ m.deleteHeading }}</h2>
        <p class="text-sm text-muted">{{ m.deleteHint }}</p>
      </div>
      <button type="button" class="min-h-11 self-start rounded-xl border border-danger px-4 font-semibold text-danger" @click="askDelete">
        {{ m.deleteButton }}
      </button>
    </section>

    <dialog
      ref="confirmWipe"
      :aria-label="messages.deleteData.heading"
      class="m-auto max-h-[92dvh] w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-bg p-5 text-ink backdrop:bg-black/60"
    >
      <form class="flex flex-col gap-3" @submit.prevent="wipeData">
        <h2 class="text-xl font-bold">{{ messages.deleteData.heading }}</h2>
        <p class="text-sm text-muted">{{ messages.deleteData.removes }}</p>
        <fieldset class="flex flex-col gap-1" data-testid="wipe-removes">
          <legend class="sr-only">{{ messages.deleteData.removes }}</legend>
          <label v-for="p in wipeParts" :key="p" class="flex min-h-9 items-center gap-3 text-sm">
            <input v-model="wipeChosen" type="checkbox" :value="p" class="size-5 shrink-0 accent-[var(--danger)]">
            {{ messages.deleteData.parts[p] }}
          </label>
          <div class="flex gap-3 text-xs">
            <button type="button" class="text-muted underline" @click="wipeChosen = [...wipeParts]">{{ messages.deleteData.selectAll }}</button>
            <button type="button" class="text-muted underline" @click="wipeChosen = []">{{ messages.deleteData.selectNone }}</button>
          </div>
        </fieldset>
        <p class="text-sm text-muted">{{ messages.deleteData.keeps }}</p>
        <ul class="flex list-disc flex-col gap-0.5 pl-5 text-sm" data-testid="wipe-keeps">
          <li v-for="p in wipeKept" :key="p">{{ messages.deleteData.parts[p] }}</li>
          <li v-for="item in messages.deleteData.keepList" :key="item">{{ item }}</li>
        </ul>
        <p v-if="!wipeChosen.length" class="text-sm text-danger" role="alert">{{ messages.deleteData.noneTicked }}</p>
        <p class="text-sm font-medium">{{ messages.deleteData.undo }}</p>
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ messages.deleteData.typeLabel }}
          <input v-model="wipeTyped" :class="field" autocomplete="off" autocapitalize="characters" spellcheck="false">
        </label>
        <p v-if="wipeError" class="text-sm text-danger" role="alert">{{ wipeError }}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink disabled:opacity-50"
            :disabled="wiping || !wipeChosen.length || wipeTyped.trim().toUpperCase() !== messages.deleteData.word"
          >
            {{ messages.deleteData.confirm }}
          </button>
          <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmWipe?.close()">{{ messages.deleteData.keep }}</button>
        </div>
      </form>
    </dialog>

    <dialog
      ref="confirmDelete"
      :aria-label="m.deleteConfirm.heading"
      class="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-bg p-5 text-ink backdrop:bg-black/60"
    >
      <form class="flex flex-col gap-4" @submit.prevent="deleteAccount">
        <h2 class="text-xl font-bold">{{ m.deleteConfirm.heading }}</h2>
        <p class="text-muted">{{ m.deleteConfirm.body }}</p>
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.deleteConfirm.typeLabel }}
          <input v-model="typed" :class="field" autocomplete="off" autocapitalize="characters" spellcheck="false">
        </label>
        <p v-if="deleteError" class="text-sm text-danger" role="alert">{{ deleteError }}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink disabled:opacity-50"
            :disabled="deleting || typed.trim().toUpperCase() !== m.deleteConfirm.word"
          >
            {{ m.deleteConfirm.confirm }}
          </button>
          <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDelete?.close()">
            {{ m.deleteConfirm.keep }}
          </button>
        </div>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Account page: display name, avatar and streak visibility, then settings. Streaks are on the Dashboard.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import NotificationSettings from '@/components/NotificationSettings.vue'
import EventSettings from '@/components/EventSettings.vue'
import MyPeople from '@/components/MyPeople.vue'
import { downloadMyData } from '@/account/export'
import { field } from '@/ui/styles'

type Visibility = 'private' | 'approved' | 'everyone'

const auth = useAuthStore()
const brain = useBrainStore()
const router = useRouter()
const m = messages.profile

const displayName = ref('')
const avatarUrl = ref<string | null>(null)
const visibility = ref<Visibility>('private')
const loaded = ref(false)
const saving = ref(false)
const notice = ref('')

onMounted(async () => {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, streak_visibility')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()
  if (data) {
    displayName.value = data.display_name ?? ''
    avatarUrl.value = data.avatar_url
    visibility.value = data.streak_visibility as Visibility
    loaded.value = true
  }
})

async function save() {
  notice.value = ''
  saving.value = true
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.value.trim() || null, streak_visibility: visibility.value })
    .eq('user_id', auth.user?.id ?? '')
  saving.value = false
  notice.value = error ? m.offline : m.saved
}


// ---------- Delete My Account (SPEC §9): confirm, then delete everything ----------
const confirmDelete = ref<HTMLDialogElement | null>(null)
const typed = ref('')
const deleting = ref(false)
const deleteError = ref('')
function askDelete() {
  typed.value = ''
  deleteError.value = ''
  confirmDelete.value?.showModal()
}
async function deleteAccount() {
  if (typed.value.trim().toUpperCase() !== m.deleteConfirm.word) return
  deleting.value = true
  deleteError.value = ''
  brain.stop()
  const ok = await auth.deleteAccount()
  deleting.value = false
  if (!ok) {
    deleteError.value = m.deleteConfirm.failed
    if (auth.user) brain.start(auth.user.id, supabaseRemote(supabase))
    return
  }
  confirmDelete.value?.close()
  await router.push({ name: 'sign-in', query: { deleted: '1' } })
}

// ---------- Download my data (SPEC §8) ----------
const exporting = ref(false)
const exportError = ref('')
async function exportData() {
  exportError.value = ''
  exporting.value = true
  try {
    await downloadMyData(auth.user?.id ?? '')
  } catch {
    exportError.value = messages.dataExport.failed
  } finally {
    exporting.value = false
  }
}

// ---------- Delete my data: start fresh, keeping the account and settings (SPEC §8) ----------
const confirmWipe = ref<HTMLDialogElement | null>(null)
const wipeTyped = ref('')
const wiping = ref(false)
const wipeError = ref('')
const wipeDone = ref('')
// Everything is ticked to start; I untick what I want to keep (SPEC §8).
type WipePart = keyof typeof messages.deleteData.parts
const wipeParts = Object.keys(messages.deleteData.parts) as WipePart[]
const wipeChosen = ref<WipePart[]>([...wipeParts])
const wipeKept = computed(() => wipeParts.filter((p) => !wipeChosen.value.includes(p)))
function askWipe() {
  wipeChosen.value = [...wipeParts]
  wipeTyped.value = ''
  wipeError.value = ''
  wipeDone.value = ''
  confirmWipe.value?.showModal()
}
async function wipeData() {
  if (wipeTyped.value.trim().toUpperCase() !== messages.deleteData.word || !wipeChosen.value.length) return
  wiping.value = true
  wipeError.value = ''
  const { data, error } = await supabase.rpc('delete_my_data', { parts: wipeChosen.value })
  wiping.value = false
  if (error) {
    wipeError.value = messages.deleteData.failed
    return
  }
  confirmWipe.value?.close()
  await brain.applyDataReset(typeof data === 'string' ? data : new Date().toISOString())
  wipeDone.value = messages.deleteData.done
}

async function signOut() {
  await auth.signOut()
  await router.push({ name: 'sign-in' })
}

const visibilities: Visibility[] = ['private', 'approved', 'everyone']
</script>
