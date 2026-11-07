<script setup lang="ts">
// SPEC §5 Profile page: display name, avatar, bio, streak visibility, and streaks (private habits never shown).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { messages } from '@/messages'
import NotificationSettings from '@/components/NotificationSettings.vue'
import type { HabitLogRow, HabitRow } from '@/sync/types'
import { streaks } from '@/habits/rules'
import { deviceTimeZone } from '@/tasks/days'

type Visibility = 'private' | 'approved' | 'everyone'

const auth = useAuthStore()
const brain = useBrainStore()
const router = useRouter()
const m = messages.profile

const displayName = ref('')
const bio = ref('')
const avatarUrl = ref<string | null>(null)
const visibility = ref<Visibility>('private')
const loaded = ref(false)
const saving = ref(false)
const notice = ref('')

onMounted(async () => {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, bio, avatar_url, streak_visibility')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()
  if (data) {
    displayName.value = data.display_name ?? ''
    bio.value = data.bio ?? ''
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
    .update({ display_name: displayName.value.trim() || null, bio: bio.value.trim() || null, streak_visibility: visibility.value })
    .eq('user_id', auth.user?.id ?? '')
  saving.value = false
  notice.value = error ? m.offline : m.saved
}

// Private habits never appear on the Profile page (SPEC §5 Habits).
const habits = useLiveQuery<HabitRow[]>(
  async () => (brain.db ? (await brain.db.habits.toArray()).filter((h) => !h.deleted_at && !h.is_private) : []),
  [],
  [() => brain.db],
)
const logs = useLiveQuery<HabitLogRow[]>(async () => (brain.db ? brain.db.habit_logs.toArray() : []), [], [() => brain.db])
// Streaks come straight from the habit logs, the source of truth (SPEC §4).
const rows = computed(() => habits.value.map((h) => ({ habit: h, ...streaks(h, logs.value, new Date(), deviceTimeZone()) })))
const longest = computed(() => [...rows.value].sort((a, b) => b.best - a.best)[0])

async function signOut() {
  await auth.signOut()
  await router.push({ name: 'sign-in' })
}

const field = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink'
const visibilities: Visibility[] = ['private', 'approved', 'everyone']
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <div class="flex items-center gap-4">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" class="size-16 rounded-full border border-line" referrerpolicy="no-referrer">
      <div v-else class="flex size-16 items-center justify-center rounded-full bg-surface text-2xl" aria-hidden="true">🙂</div>
      <h1 class="text-2xl font-bold">{{ displayName || m.heading }}</h1>
    </div>

    <section class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.streaksHeading }}</h2>
      <p v-if="longest && longest.best > 0" class="rounded-xl bg-surface p-3 font-medium" data-testid="longest-streak">
        🏆 {{ m.longest(longest.best, longest.habit.title) }}
      </p>
      <p v-if="!habits.length" class="text-muted">{{ m.noStreaks }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="r in rows" :key="r.habit.id" class="flex items-center justify-between rounded-2xl border border-line bg-surface p-3" data-testid="profile-streak">
          <span>{{ r.habit.title }}</span>
          <span class="text-sm text-muted">{{ messages.habits.streak(r.current) }} · {{ messages.habits.best(r.best) }}</span>
        </li>
      </ul>
    </section>

    <form v-if="loaded" class="flex flex-col gap-4" @submit.prevent="save">
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.displayName }}
        <input v-model="displayName" :class="field">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.bio }}
        <textarea v-model="bio" rows="3" :class="[field, 'py-2']" />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.visibility }}
        <select v-model="visibility" :class="field">
          <option v-for="v in visibilities" :key="v" :value="v">{{ m.visibilityOptions[v] }}</option>
        </select>
        <span class="text-xs">{{ m.visibilityHint }}</span>
      </label>
      <button type="submit" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" :disabled="saving">{{ m.save }}</button>
      <p v-if="notice" role="status" class="text-muted">{{ notice }}</p>
    </form>
    <p v-else class="text-muted">{{ m.offline }}</p>

    <NotificationSettings />

    <button type="button" class="self-start text-sm text-muted underline" @click="signOut">{{ messages.signOut.button }}</button>
  </main>
</template>
