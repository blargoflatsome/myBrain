<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div class="flex items-center gap-4">
      <UserAvatar :url="avatarUrl" size="lg" />
      <h1 class="text-2xl font-bold">{{ displayName || m.heading }}</h1>
    </div>

    <!-- SPEC §5 Help: linked from here as well as from More. -->
    <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3" aria-labelledby="account-help" data-testid="account-help">
      <span class="min-w-0">
        <h2 id="account-help" class="font-semibold">{{ g.helpTitle }}</h2>
        <span class="block text-sm text-muted">{{ g.helpHint }}</span>
      </span>
      <RouterLink to="/help" class="min-h-11 shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm font-medium">{{ g.openHelp }}</RouterLink>
    </section>

    <AccountGroup id="profile" :title="m.settingsHeading" :summary="g.profile">
      <section data-testid="profile-settings" :aria-label="m.settingsHeading">
        <form v-if="loaded" class="flex flex-col gap-4" @submit.prevent="save">
          <label :class="[fieldLabel, 'sm:max-w-sm']">
            {{ m.displayName }}
            <input v-model="displayName" maxlength="120" :class="field">
          </label>
          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" :class="primaryButtonSmall" :disabled="saving">{{ m.save }}</button>
            <!-- SPEC §5 Profiles: my profile as my connections see it. -->
            <RouterLink v-if="brain.userId" :to="`/people/${brain.userId}`" class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium" data-testid="view-my-profile">
              <AppIcon name="user" size="size-5" />{{ messages.personProfile.viewMine }}
            </RouterLink>
            <p v-if="notice" role="status" class="text-sm text-muted">{{ notice }}</p>
          </div>
        </form>
        <p v-else class="text-muted">{{ m.offline }}</p>
      </section>
    </AccountGroup>

    <AccountGroup id="settings" :title="g.settingsTitle" :summary="g.settings">
      <!-- SPEC §5 Celebrations: how lively celebrations are, saved to my profile as soon as I change it (one choice
           on its own saves on change, SPEC §5 Account page). -->
      <section class="rounded-xl border border-line px-4 py-3" :aria-label="cs.label" data-testid="celebrations-settings">
        <div v-if="loaded" class="flex flex-col gap-3">
          <label :class="fieldLabel">
            <span class="pb-2">{{ cs.label }}</span>
            <select v-model="celebrations" :class="field" data-testid="celebrations-setting" @change="saveCelebrations">
              <option v-for="c in CELEBRATION_SETTINGS" :key="c" :value="c">{{ cs.options[c] }}</option>
            </select>
            <span class="text-xs">{{ cs.hint }}</span>
          </label>
          <p class="min-h-5 text-sm text-muted" role="status">{{ celebrationsNotice }}</p>
        </div>
        <p v-else class="text-muted">{{ m.offline }}</p>
      </section>

      <!-- SPEC §3 Appearance: System, Light or Dark, saved as soon as I change it. -->
      <section class="rounded-xl border border-line px-4 py-3" :aria-label="as.label" data-testid="appearance-settings">
        <div class="flex flex-col gap-3">
          <label :class="fieldLabel">
            <span class="pb-2">{{ as.label }}</span>
            <select v-model="appearanceChoice" :class="field" data-testid="appearance-setting" @change="saveAppearance">
              <option v-for="a in APPEARANCES" :key="a" :value="a">{{ as.options[a] }}</option>
            </select>
          </label>
          <p class="min-h-5 text-sm text-muted" role="status">{{ appearanceNotice }}</p>
        </div>
      </section>

      <!-- SPEC §5 Habits Pause streaks: stays on until I turn it off; saved on change (works offline, it syncs). -->
      <section class="rounded-xl border border-line px-4 py-3" :aria-label="ps.label" data-testid="pause-settings">
        <div class="flex flex-col gap-3">
          <label class="flex min-h-11 items-center gap-3">
            <input type="checkbox" :class="checkbox" :checked="streaksPaused" data-testid="pause-streaks" @change="savePause(($event.target as HTMLInputElement).checked)">
            <span>{{ ps.label }}</span>
          </label>
          <span class="text-xs text-muted">{{ ps.hint }}</span>
          <p class="min-h-5 text-sm text-muted" role="status">{{ pauseNotice }}</p>
        </div>
      </section>

      <!-- SPEC §5 Tags page: reached from here. -->
      <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3" aria-labelledby="account-tags" data-testid="account-tags">
        <span class="min-w-0">
          <h2 id="account-tags" class="font-semibold">{{ g.tagsTitle }}</h2>
          <span class="block text-sm text-muted">{{ g.tagsHint }}</span>
        </span>
        <RouterLink to="/tags" class="min-h-11 shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm font-medium">{{ g.openTags }}</RouterLink>
      </section>
    </AccountGroup>

    <AccountGroup id="reminders" :title="messages.notifications.heading" :summary="g.reminders">
      <NotificationSettings />
    </AccountGroup>

    <AccountGroup id="events" :title="g.eventsTitle" :summary="g.events">
      <div class="grid items-start gap-4 lg:grid-cols-2">
        <EventSettings />
        <AvailabilityCard />
      </div>
    </AccountGroup>

    <AccountGroup id="people" :title="g.peopleTitle" :summary="g.people">
      <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4" aria-labelledby="account-connections">
        <span class="min-w-0">
          <h3 id="account-connections" class="font-semibold">{{ messages.connections.heading }}</h3>
          <span class="block text-sm text-muted">{{ g.connectionsHint }}</span>
        </span>
        <RouterLink to="/connections" class="min-h-11 shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm font-medium">{{ g.openConnections }}</RouterLink>
      </section>
      <MyPeople />
    </AccountGroup>



    <AccountGroup id="data" :title="messages.dataExport.heading" :summary="g.data">
      <div class="grid gap-4 sm:grid-cols-2" data-testid="data-export">
        <section class="flex flex-col gap-2 rounded-xl border border-line p-4" :aria-label="messages.dataExport.button">
          <p class="text-sm text-muted">{{ messages.dataExport.body }}</p>
          <button type="button" class="mt-auto min-h-11 self-start rounded-xl border border-line px-4" :disabled="exporting" @click="exportData">
            {{ exporting ? messages.dataExport.working : messages.dataExport.button }}
          </button>
          <p v-if="exportError" class="text-sm text-danger" role="alert">{{ exportError }}</p>
        </section>
        <section class="flex flex-col gap-2 rounded-xl border border-warning/50 p-4" :aria-label="messages.deleteData.button" data-testid="delete-data">
          <p class="text-sm text-muted">{{ messages.deleteData.hint }}</p>
          <button type="button" class="mt-auto min-h-11 self-start rounded-xl border border-warning px-4 font-semibold text-warning" @click="askWipe">
            {{ messages.deleteData.button }}
          </button>
          <p v-if="wipeDone" class="text-sm" role="status">{{ wipeDone }}</p>
        </section>
      </div>
    </AccountGroup>

    <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3" :aria-label="messages.signOut.button" data-testid="sign-out">
      <p class="min-w-0 text-sm text-muted">{{ g.signOutHint }}</p>
      <button type="button" :class="[smallButton, 'shrink-0 font-medium']" @click="signOut(false)">
        {{ messages.signOut.button }}
      </button>
    </section>

    <section class="w-auto block rounded-xl border border-danger/40 p-4" data-testid="delete-account" :aria-label="m.deleteHeading">
      <button type="button" class="mt-auto min-h-11 self-start rounded-xl border border-danger px-4 font-semibold text-danger" @click="askDelete">
        {{ m.deleteButton }}
      </button>
    </section>


    <p class="flex flex-wrap justify-center gap-4 text-sm">
      <RouterLink to="/privacy" class="text-muted underline">{{ messages.legal.privacy }}</RouterLink>
      <RouterLink to="/terms" class="text-muted underline">{{ messages.legal.terms }}</RouterLink>
    </p>

    <TypeToConfirmDialog
      ref="confirmWipe"
      :heading="messages.deleteData.heading"
      :word="messages.deleteData.word"
      :type-label="messages.deleteData.typeLabel"
      :confirm-label="messages.deleteData.confirm"
      :keep-label="messages.deleteData.keep"
      tone="warning"
      :busy="wiping"
      :ready="wipeChosen.length > 0"
      :error="wipeError"
      @confirm="wipeData"
    >
      <p class="text-sm text-muted">{{ messages.deleteData.removes }}</p>
      <fieldset class="flex flex-col gap-1" data-testid="wipe-removes">
        <legend class="sr-only">{{ messages.deleteData.removes }}</legend>
        <label v-for="p in wipeParts" :key="p" class="flex min-h-9 items-center gap-3 text-sm">
          <input v-model="wipeChosen" type="checkbox" :value="p" class="size-5 shrink-0 accent-[var(--warning)]">
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
    </TypeToConfirmDialog>

    <TypeToConfirmDialog
      ref="confirmDelete"
      :heading="m.deleteConfirm.heading"
      :word="m.deleteConfirm.word"
      :type-label="m.deleteConfirm.typeLabel"
      :confirm-label="m.deleteConfirm.confirm"
      :keep-label="m.deleteConfirm.keep"
      :busy="deleting"
      :error="deleteError"
      @confirm="deleteAccount"
    >
      <p class="text-muted">{{ m.deleteConfirm.body }}</p>
    </TypeToConfirmDialog>
    <ConfirmDialog
      ref="confirmUnsent"
      :heading="messages.signOut.unsent.heading"
      :body="messages.signOut.unsent.body(unsent)"
      :confirm-label="messages.signOut.unsent.confirm"
      :keep-label="messages.signOut.unsent.keep"
      @confirm="signOut(true)"
    />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Account page: display name and avatar, then settings. Streaks are on the Habits page.
import { useProfileStore } from '@/stores/profile'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TypeToConfirmDialog from '@/components/TypeToConfirmDialog.vue'
import { computed, onMounted, ref } from 'vue'
import AccountGroup from '@/account/components/AccountGroup.vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import NotificationSettings from '@/notifications/components/NotificationSettings.vue'
import EventSettings from '@/events/components/EventSettings.vue'
import MyPeople from '@/events/components/MyPeople.vue'
import AvailabilityCard from '@/events/components/AvailabilityCard.vue'
import { downloadMyData } from '@/account/export'
import { clearAppKeys } from '@/ui/storage'
import { checkbox, field, fieldLabel, primaryButtonSmall, smallButton } from '@/ui/styles'
import { appearance, APPEARANCES, setAppearance, type Appearance } from '@/ui/appearance'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { openPause } from '@/habits/rules'
import { live } from '@/sync/live'
import type { HabitPauseRow } from '@/sync/types'
import { useCelebrateStore } from '@/stores/celebrate'
import { CELEBRATION_SETTINGS, parseSetting, type CelebrationSetting } from '@/celebrate/rules'

const auth = useAuthStore()
const brain = useBrainStore()
const profile = useProfileStore()
const router = useRouter()
const m = messages.profile
const g = messages.accountGroups
const cs = messages.celebrations.setting
const celebrate = useCelebrateStore()
const celebrations = ref<CelebrationSetting>(celebrate.setting)

const displayName = ref('')
const avatarUrl = ref<string | null>(null)
const loaded = ref(false)
const saving = ref(false)
const notice = ref('')

onMounted(async () => {
  const data = await profile.load()
  if (data) {
    displayName.value = data.display_name ?? ''
    avatarUrl.value = data.avatar_url
    celebrations.value = parseSetting(data.celebrations)
    loaded.value = true
  }
})

async function save() {
  notice.value = ''
  saving.value = true
  const ok = await profile.update({ display_name: displayName.value.trim() || null })
  saving.value = false
  notice.value = ok ? m.saved : m.offline
}

// SPEC §3 Appearance: applies at once on this device, and is saved to my profile for my other devices.
const as = messages.appearance
const appearanceChoice = ref<Appearance>(appearance.value)
const appearanceNotice = ref('')
async function saveAppearance() {
  appearanceNotice.value = ''
  setAppearance(appearanceChoice.value)
  const ok = await profile.update({ appearance: appearanceChoice.value })
  appearanceNotice.value = ok ? m.saved : m.offline
}

// SPEC §5 Habits Pause streaks: kept as pause periods, synced like the rest of my habits.
const ps = messages.pauseStreaks
const pauses = useLiveQuery<HabitPauseRow[]>(async () => (brain.db ? live(await brain.db.habit_pauses.toArray()) : []), [], [() => brain.db])
const streaksPaused = computed(() => !!openPause(pauses.value))
const pauseNotice = ref('')
async function savePause(on: boolean) {
  pauseNotice.value = ''
  await brain.setStreaksPaused(on)
  pauseNotice.value = m.saved
}

// Celebrations has its own Save in Account Settings.
const celebrationsNotice = ref('')
async function saveCelebrations() {
  celebrationsNotice.value = ''
  const ok = await profile.update({ celebrations: celebrations.value })
  if (ok) celebrate.setSetting(celebrations.value)
  celebrationsNotice.value = ok ? m.saved : m.offline
}


// ---------- Delete My Account (SPEC §5 Account page, §8): confirm, then delete everything ----------
const confirmDelete = ref<InstanceType<typeof TypeToConfirmDialog> | null>(null)
const deleting = ref(false)
const deleteError = ref('')
function askDelete() {
  deleteError.value = ''
  confirmDelete.value?.open()
}
async function deleteAccount() {
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
const confirmWipe = ref<InstanceType<typeof TypeToConfirmDialog> | null>(null)
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
  wipeError.value = ''
  wipeDone.value = ''
  confirmWipe.value?.open()
}
async function wipeData() {
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

// SPEC §8 Sign out: nothing of mine stays on this device. Queued changes upload first; if some can't (offline),
// ask before throwing them away.
const confirmUnsent = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const unsent = ref(0)
async function signOut(discardUnsent: boolean) {
  if (!discardUnsent) {
    unsent.value = await brain.uploadBeforeSignOut()
    if (unsent.value > 0) return confirmUnsent.value?.open()
  }
  confirmUnsent.value?.close()
  await brain.forgetDevice()
  clearAppKeys()
  await auth.signOut()
  await router.push({ name: 'sign-in' })
}

</script>
