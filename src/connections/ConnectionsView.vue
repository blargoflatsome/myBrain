<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <p class="text-sm text-muted">{{ m.intro }}</p>
    <ConnectionsPanel />
  </main>
</template>

<script setup lang="ts">
// SPEC §10 Connections: the Connections page (More menu, notification taps, the Contacts window). Its content is the
// shared ConnectionsPanel, also shown in Account › People.
import ConnectionsPanel from '@/connections/components/ConnectionsPanel.vue'
import { messages } from '@/messages'

const m = messages.connections
</script>
