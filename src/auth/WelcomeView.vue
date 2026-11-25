<template>
  <main class="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.body }}</p>
    </div>
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <label :class="fieldLabel">
        {{ m.phone }}
        <input v-model="phone" v-field-error="phoneError" type="tel" autocomplete="tel" :class="fieldOnPage" @input="error = ''">
        <span class="text-xs">{{ m.phoneHint }}</span>
      </label>
      <FieldError :of="phoneError" />
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button type="submit" :class="primaryButton" :disabled="saving">{{ m.save }}</button>
    </form>
  </main>
</template>

<script setup lang="ts">
import { notSaved, useProfileStore } from '@/stores/profile'
import { safeNext } from '@/security/redirect'
// SPEC §5 Accounts and contact info: after the first sign-in, a short step for my phone number. Existing accounts see it once too.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import FieldError from '@/components/FieldError.vue'
import { useFieldError, vFieldError } from '@/composables/useFieldError'
import { fieldLabel, fieldOnPage, primaryButton } from '@/ui/styles'

const route = useRoute()
const router = useRouter()
const m = messages.welcome

const phone = ref('')
// A number that isn't one is refused beside the box; a save that didn't go through is said out loud.
const phoneError = useFieldError()
const error = ref('')
const saving = ref(false)

async function save() {
  error.value = ''
  if (!isPhone(phone.value)) return phoneError.refuse(m.phoneError)
  saving.value = true
  const why = await useProfileStore().update({ phone: phone.value.trim() })
  saving.value = false
  if (why) {
    error.value = notSaved(why, m.offline)
    return
  }
  const next = safeNext(route.query.next)
  await router.replace(next)
}
</script>
