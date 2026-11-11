<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <CaptureForm :shared-input="shared || undefined" />
  </main>
</template>

<script setup lang="ts">
// SPEC §3/§5: the Capture page, for the home-screen shortcut and text shared from other apps (Web Share Target).
// Everywhere else in the app, Capture opens as a window over the current page (CaptureDialog).
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CaptureForm from '@/components/CaptureForm.vue'
import { sharedText } from '@/capture/capture'

const route = useRoute()
const router = useRouter()
const shared = sharedText(route.query)
onMounted(async () => {
  if (Object.keys(route.query).length) await router.replace({ query: {} })
})
</script>
