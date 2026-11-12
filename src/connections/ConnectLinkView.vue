<template>
  <main class="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-8 md:px-8 pb-28 text-center">
    <h1 class="text-2xl font-bold">{{ m.linkHeading }}</h1>
    <p v-if="state === 'loading'" class="text-muted" role="status">{{ m.linkLoading }}</p>
    <template v-else-if="state === 'ready' && who">
      <img v-if="who.avatar_url" :src="who.avatar_url" alt="" class="mx-auto size-20 rounded-full" referrerpolicy="no-referrer">
      <p class="text-lg [overflow-wrap:anywhere]" data-testid="link-owner">{{ who.already_connected ? m.alreadyConnected(who.display_name) : m.connectWith(who.display_name) }}</p>
      <button v-if="!who.already_connected" type="button" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="connect">{{ m.connect }}</button>
    </template>
    <p v-else-if="state === 'done'" role="status" data-testid="link-done">{{ m.accepted(name) }}</p>
    <p v-else role="alert" data-testid="link-problem">{{ problem || m.linkGone }}</p>
    <RouterLink to="/connections" class="text-accent underline">{{ m.heading }}</RouterLink>
  </main>
</template>

<script setup lang="ts">
// SPEC §10 Connections, part 2: someone opened my connect link; they see whose it is and tap Connect, which connects
// us straight away (I shared it). An expired, used or cancelled link says it no longer works.
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { previewLink, useLink, type LinkOwner } from '@/connections/connections'
import { messages } from '@/messages'

const m = messages.connections
const route = useRoute()
const token = String(route.params.token ?? '')
const state = ref<'loading' | 'ready' | 'done' | 'gone'>('loading')
const who = ref<LinkOwner | null>(null)
const name = ref('')
const problem = ref('')
onMounted(async () => {
  try {
    who.value = (await previewLink({ token }))[0] ?? null
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e)
  }
  state.value = who.value ? 'ready' : 'gone'
})
async function connect() {
  const result = await useLink({ token }).catch(() => null)
  if (!result) return (state.value = 'gone')
  name.value = result
  state.value = 'done'
}
</script>
