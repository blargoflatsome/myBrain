<template>
  <form class="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-dashed border-line p-4 text-left" novalidate data-testid="dev-sign-in" @submit.prevent="signIn">
    <h2 class="text-lg font-semibold">{{ m.heading }}</h2>
    <p class="text-sm text-muted">{{ m.hint }}</p>
    <label :class="fieldLabel">
      {{ m.who }}
      <select v-model="email" :class="field">
        <option v-for="u in users" :key="u.email" :value="u.email">{{ u.name }} ({{ u.email }})</option>
      </select>
    </label>
    <label :class="fieldLabel">
      {{ m.password }}
      <input v-model="password" type="password" autocomplete="current-password" :class="field">
    </label>
    <button type="submit" :class="[smallButton, 'font-medium']" :disabled="busy">{{ m.button }}</button>
    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
  </form>
</template>

<script setup lang="ts">
// Dev-only sign-in (SPEC §3 Testing): the test accounts made by `npm run dev:accounts`, on the local dev server only,
// so sharing and connections can be tried as more than one person. Never shown in a production build.
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { messages } from '@/messages'
import { takeReturn } from '@/router/returnTo'
import { field, fieldLabel, smallButton } from '@/ui/styles'

const m = messages.devSignIn
const users = [
  { name: 'Dev Alice', email: 'dev-alice@myadhdbrain.test' },
  { name: 'Dev Bob', email: 'dev-bob@myadhdbrain.test' },
  { name: 'Dev Carol', email: 'dev-carol@myadhdbrain.test' },
]
const email = ref(users[0]!.email)
const password = ref('')
const error = ref('')
const busy = ref(false)
async function signIn() {
  error.value = ''
  busy.value = true
  const { error: failed } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  busy.value = false
  if (failed) return (error.value = failed.message)
  // A full load, so the app starts its sync as the new account.
  window.location.assign(takeReturn() ?? '/')
}
</script>
