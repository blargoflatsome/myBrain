<template>
  <main class="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div class="flex flex-col gap-2">
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.body }}</p>
    </div>
    <RouterLink to="/" :class="[primaryButton, 'flex items-center justify-center self-start']">{{ m.home }}</RouterLink>
  </main>
</template>

<script setup lang="ts">
// SPEC §8 Search listing and 404s: an address the app doesn't have (Netlify answers it with status 404).
import { RouterLink } from 'vue-router'
import { messages } from '@/messages'
import { primaryButton } from '@/ui/styles'

const m = messages.notFound
</script>
