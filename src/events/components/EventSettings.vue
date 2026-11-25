<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" data-testid="event-settings">
    <h3 class="font-semibold">{{ m.heading }}</h3>
    <template v-if="loaded">
      <label :class="fieldLabel">
        {{ m.phone }}
        <input v-model="phone" type="tel" autocomplete="tel" :class="field">
      </label>
      <label class="flex items-center justify-between gap-4">
        <span><span class="font-medium">{{ m.shareAvailability }}</span><span class="block text-xs text-muted">{{ m.shareAvailabilityHint }}</span></span>
        <input v-model="shareAvailability" type="checkbox" :class="checkbox">
      </label>
      <label :class="fieldLabel">
        {{ m.dropoutMessage }}
        <textarea v-model="dropoutMessage" rows="3" :class="[field, 'py-2']" />
      </label>
      <label :class="fieldLabel">
        {{ m.cancelMessage }}
        <textarea v-model="cancelMessage" rows="3" :class="[field, 'py-2']" />
      </label>
      <p class="-mt-2 text-xs text-muted">{{ m.variables }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex items-center gap-3">
        <button type="button" :class="primaryButtonSmall" @click="save">{{ m.save }}</button>
        <p v-if="notice" class="text-sm text-muted" role="status">{{ notice }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Accounts and contact info, Cancelling: phone number, whether my free/busy is shared, and my two cancellation messages.
import { notSaved, useProfileStore } from '@/stores/profile'
import { onMounted, ref } from 'vue'
import { isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import { checkbox, field, fieldLabel, primaryButtonSmall } from '@/ui/styles'

const m = messages.eventSettings
const w = messages.welcome

const loaded = ref(false)
const phone = ref('')
const shareAvailability = ref(true)
const dropoutMessage = ref('')
const cancelMessage = ref('')
const notice = ref('')
const error = ref('')

onMounted(async () => {
  const data = await useProfileStore().load()
  if (!data) return
  phone.value = data.phone ?? ''
  shareAvailability.value = data.share_availability ?? true
  dropoutMessage.value = data.cancel_dropout_message ?? ''
  cancelMessage.value = data.cancel_event_message ?? ''
  loaded.value = true
})

async function save() {
  notice.value = ''
  error.value = ''
  if (phone.value.trim() && !isPhone(phone.value)) {
    error.value = w.phoneError
    return
  }
  const why = await useProfileStore().update({
    phone: phone.value.trim() || null,
    share_availability: shareAvailability.value,
    cancel_dropout_message: dropoutMessage.value.trim() || undefined,
    cancel_event_message: cancelMessage.value.trim() || undefined,
  })
  if (why) error.value = notSaved(why, messages.profile.offline)
  else notice.value = m.saved
}
</script>
