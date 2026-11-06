<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { messages } from '@/messages'

const auth = useAuthStore()
const failed = ref(false)
const busy = ref(false)

async function signIn() {
  failed.value = false
  busy.value = true
  try {
    await auth.signInWithGoogle()
  } catch {
    failed.value = true
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
    <div>
      <p class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ messages.appName }}</p>
      <h1 class="mt-1 text-3xl font-bold">{{ messages.signIn.heading }}</h1>
      <p class="mt-2 text-slate-600">{{ messages.signIn.body }}</p>
    </div>
    <button
      type="button"
      class="min-h-12 rounded-lg bg-slate-900 px-4 text-lg font-medium text-white disabled:opacity-60"
      :disabled="busy"
      @click="signIn"
    >
      {{ messages.signIn.button }}
    </button>
    <p v-if="failed" role="alert" class="text-red-700">{{ messages.signIn.error }}</p>
  </main>
</template>
