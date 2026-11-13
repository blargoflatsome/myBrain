<template>
  <!-- A phone screenshot from public/help (made by `npm run docs:images`), framed like a phone. -->
  <img
    :src="`/help/${name}.webp`"
    :alt="alt"
    width="585"
    height="1170"
    loading="lazy"
    decoding="async"
    class="h-auto w-full max-w-[17rem] rounded-[1.75rem] border-4 border-line bg-surface shadow-lg"
  >
</template>

<script setup lang="ts">
// SPEC §5 Home page and Help: the pictures on both pages.
defineProps<{ name: string; alt: string }>()
</script>
