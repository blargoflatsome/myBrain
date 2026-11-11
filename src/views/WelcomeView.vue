<template>
  <main class="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.body }}</p>
    </div>
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.phone }}
        <input v-model="phone" type="tel" autocomplete="tel" :class="fieldOnPage" @input="error = ''">
        <span class="text-xs">{{ m.phoneHint }}</span>
      </label>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.notify }}</legend>
        <div class="flex gap-2" role="radiogroup" :aria-label="m.notify">
          <label
            v-for="o in (['email', 'text', 'both'] as const)"
            :key="o"
            class="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3"
            :class="notify === o ? 'choice-on border-accent bg-accent/10 font-semibold text-ink' : 'border-line bg-surface'"
          >
            <input v-model="notify" type="radio" :value="o" class="sr-only">{{ m.notifyOptions[o] }}
          </label>
        </div>
        <span class="text-xs text-muted">{{ m.notifyHint }}</span>
      </fieldset>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button type="submit" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" :disabled="saving">{{ m.save }}</button>
    </form>
  </main>
</template>

<script setup lang="ts">
import { safeNext } from '@/security/redirect'
// SPEC §5 Accounts and contact info: after the first sign-in, a short step for my phone number and how event news
// reaches me. Existing accounts see it once too.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import { fieldOnPage } from '@/ui/styles'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const m = messages.welcome

type Notify = 'email' | 'text' | 'both'
const phone = ref('')
const notify = ref<Notify>('email')
const error = ref('')
const saving = ref(false)

async function save() {
  error.value = ''
  if (!isPhone(phone.value)) {
    error.value = m.phoneError
    return
  }
  saving.value = true
  const { error: failed } = await supabase
    .from('profiles')
    .update({ phone: phone.value.trim(), event_notify_method: notify.value })
    .eq('user_id', auth.user?.id ?? '')
  saving.value = false
  if (failed) {
    error.value = m.offline
    return
  }
  const next = safeNext(route.query.next)
  await router.replace(next)
}
</script>
