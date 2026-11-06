<script setup lang="ts">
// Placeholder home screen. Quick capture and the daily list arrive in build steps 2 and 3 (SPEC §11).
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { messages } from '@/messages'

const auth = useAuthStore()
const router = useRouter()

async function signOut() {
  await auth.signOut()
  await router.push({ name: 'sign-in' })
}
</script>

<template>
  <main class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
    <h1 class="text-3xl font-bold">{{ messages.appName }}</h1>
    <p class="text-slate-600">{{ messages.home.tagline }}</p>
    <button type="button" class="self-start text-sm text-slate-500 underline" @click="signOut">
      {{ messages.signOut.button }}
    </button>
  </main>
</template>
