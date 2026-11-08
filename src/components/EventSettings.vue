<template>
  <section class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" data-testid="event-settings">
    <h2 class="text-lg font-semibold">{{ m.heading }}</h2>
    <template v-if="loaded">
      <label class="flex flex-col gap-1 text-sm text-muted">
        <span class="flex items-center justify-between">{{ m.phone }}<span v-if="phone && !phoneVerified" class="text-xs">{{ m.unverified }}</span></span>
        <input v-model="phone" type="tel" autocomplete="tel" :class="field">
      </label>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.notify }}</legend>
        <div class="flex gap-2" role="radiogroup" :aria-label="m.notify">
          <label
            v-for="o in (['email', 'text', 'both'] as const)"
            :key="o"
            class="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm"
            :class="notify === o ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line'"
          >
            <input v-model="notify" type="radio" :value="o" class="sr-only">{{ w.notifyOptions[o] }}
          </label>
        </div>
        <span class="text-xs text-muted">{{ w.notifyHint }}</span>
      </fieldset>
      <label class="flex items-center justify-between gap-4">
        <span><span class="font-medium">{{ m.shareAvailability }}</span><span class="block text-xs text-muted">{{ m.shareAvailabilityHint }}</span></span>
        <input v-model="shareAvailability" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.dropoutMessage }}
        <textarea v-model="dropoutMessage" rows="3" :class="[field, 'py-2']" />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.cancelMessage }}
        <textarea v-model="cancelMessage" rows="3" :class="[field, 'py-2']" />
      </label>
      <p class="-mt-2 text-xs text-muted">{{ m.variables }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex items-center gap-3">
        <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="save">{{ m.save }}</button>
        <p v-if="notice" class="text-sm text-muted" role="status">{{ notice }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Accounts and contact info, Cancelling: phone number, how event news reaches me, whether I can be found by
// name, whether my free/busy is shared, and my two cancellation messages.
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import { field } from '@/ui/styles'

const auth = useAuthStore()
const m = messages.eventSettings
const w = messages.welcome

type Notify = 'email' | 'text' | 'both'
const loaded = ref(false)
const phone = ref('')
const phoneVerified = ref(false)
const notify = ref<Notify>('email')
const shareAvailability = ref(true)
const dropoutMessage = ref('')
const cancelMessage = ref('')
const notice = ref('')
const error = ref('')

onMounted(async () => {
  const { data } = await supabase
    .from('profiles')
    .select('phone, phone_verified, event_notify_method, share_availability, cancel_dropout_message, cancel_event_message')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()
  if (!data) return
  phone.value = data.phone ?? ''
  phoneVerified.value = !!data.phone_verified
  notify.value = (data.event_notify_method as Notify) ?? 'email'
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
  const { error: failed } = await supabase
    .from('profiles')
    .update({
      phone: phone.value.trim() || null,
      event_notify_method: notify.value,
      share_availability: shareAvailability.value,
      cancel_dropout_message: dropoutMessage.value.trim() || undefined,
      cancel_event_message: cancelMessage.value.trim() || undefined,
    })
    .eq('user_id', auth.user?.id ?? '')
  if (failed) error.value = messages.profile.offline
  else notice.value = m.saved
}
</script>
