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
      <p v-if="error || settingSave.failed" class="text-sm text-danger" role="alert">{{ error || settingSave.notice }}</p>
      <div class="flex items-center gap-3">
        <button type="button" :class="primaryButtonSmall" @click="save">{{ m.save }}</button>
        <p v-if="!settingSave.failed && settingSave.notice" class="text-sm text-muted" role="status">{{ settingSave.notice }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Accounts and contact info, Cancelling: phone number, whether my free/busy is shared, and my two cancellation messages.
import { useProfileStore } from '@/stores/profile'
import { useSettingSave } from '@/composables/useSettingSave'
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
// A phone number that isn't one is refused here; the save's own note says Saved, or why not, as an alert when it failed.
const error = ref('')
const settingSave = useSettingSave()

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
  error.value = ''
  if (phone.value.trim() && !isPhone(phone.value)) {
    settingSave.clear()
    error.value = w.phoneError
    return
  }
  await settingSave.saveProfile({
    phone: phone.value.trim() || null,
    share_availability: shareAvailability.value,
    cancel_dropout_message: dropoutMessage.value.trim() || undefined,
    cancel_event_message: cancelMessage.value.trim() || undefined,
  })
}
</script>
