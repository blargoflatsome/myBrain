<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <p v-if="state === 'loading'" class="text-muted" role="status">{{ m.loading }}</p>
    <template v-else-if="state === 'unavailable' || !person">
      <h1 class="text-2xl font-bold">{{ messages.pageTitles.person }}</h1>
      <p data-testid="profile-unavailable">{{ m.unavailable }}</p>
      <RouterLink to="/connections" class="self-start text-accent underline">{{ m.back }}</RouterLink>
    </template>
    <template v-else>
      <div class="flex min-w-0 items-center gap-4">
        <UserAvatar :url="person.avatar_url" size="lg" />
        <h1 class="min-w-0 text-2xl font-bold [overflow-wrap:anywhere]" data-testid="profile-name">{{ person.display_name }}</h1>
      </div>
      <button v-if="!isMe" type="button" :class="[primaryButton, 'self-start']" @click="inviteDialog?.open()">{{ m.invite }}</button>
      <ProfileTrophies :badges="person.badges" :theirs="!isMe" />
      <InviteToEventDialog
        v-if="!isMe"
        ref="inviteDialog"
        :friend-id="friendId"
        :name="person.display_name"
        :invited-events="person.invited_events"
        @invited="(id) => fetched?.invited_events.push(id)"
      />
    </template>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Profiles: a connection's profile: their picture, name, earned trophies and Invite to event. Read fresh from
// the server each visit, which only answers for connections. My own profile is drawn from this device instead.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import UserAvatar from '@/components/UserAvatar.vue'
import ProfileTrophies from '@/profiles/components/ProfileTrophies.vue'
import InviteToEventDialog from '@/profiles/components/InviteToEventDialog.vue'
import { connectionProfile, type PersonProfile } from '@/profiles/profiles'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { useProfileStore } from '@/stores/profile'
import { live } from '@/sync/live'
import type { BadgeRow } from '@/sync/types'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { primaryButton } from '@/ui/styles'

const m = messages.personProfile
const route = useRoute()
const friendId = computed(() => String(route.params.id ?? ''))
const fetched = ref<PersonProfile | null>(null)
const fetchState = ref<'loading' | 'ready' | 'unavailable'>('loading')
const inviteDialog = ref<InstanceType<typeof InviteToEventDialog> | null>(null)
const brain = useBrainStore()
const profile = useProfileStore()
const isMe = computed(() => !!brain.userId && friendId.value === brain.userId)

// My own profile as my connections see it: my name and picture, and my trophies as they are on this device.
const myBadges = useLiveQuery<BadgeRow[]>(async () => (brain.db ? live(await brain.db.badges.toArray()) : []), [], [() => brain.db])
const person = computed<PersonProfile | null>(() =>
  isMe.value
    ? { display_name: profile.shown?.display_name ?? messages.profile.heading, avatar_url: profile.shown?.avatar_url ?? null, badges: myBadges.value, invited_events: [] }
    : fetched.value,
)
const state = computed(() => (isMe.value ? 'ready' : fetchState.value))

watch(
  friendId,
  async (id) => {
    if (isMe.value) return
    fetchState.value = 'loading'
    fetched.value = await connectionProfile(id).catch(() => null)
    fetchState.value = fetched.value ? 'ready' : 'unavailable'
  },
  { immediate: true },
)
</script>
