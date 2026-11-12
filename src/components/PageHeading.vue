<template>
  <div class="flex flex-col gap-1">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold break-words">{{ heading }}</h1>
      <slot />
    </div>
    <p v-if="intro" class="text-muted" :data-testid="introTestId">{{ intro }}</p>
  </div>
</template>

<script setup lang="ts">
// SPEC §2 Adding looks alike everywhere: a page's heading, with its "+ New …" button (the slot) on the right and the
// one-line intro under it.
defineProps<{ heading: string; intro?: string; introTestId?: string }>()
</script>
