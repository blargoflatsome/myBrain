<template>
  <form class="flex flex-col gap-2" novalidate data-testid="pair-tv-form" @submit.prevent="pair">
    <label :class="fieldLabel">
      {{ m.codeLabel }}
      <input
        v-model="code"
        v-field-error="codeError"
        :class="field"
        class="font-mono tracking-widest uppercase"
        maxlength="12"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        data-testid="pair-code"
      >
    </label>
    <FieldError :of="codeError" data-testid="pair-error" />
    <div>
      <button type="submit" :class="primaryButtonSmall" :disabled="busy">{{ busy ? m.pairing : m.pair }}</button>
    </div>
    <p v-if="failure" class="text-sm text-danger" role="alert">{{ failure }}</p>
    <p class="text-sm" role="status" data-testid="pair-done">{{ done }}</p>
  </form>
</template>

<script setup lang="ts">
// SPEC §9 Signing in by pairing: I type (or the QR code fills in) the code shown on my TV and approve it with Pair this
// TV. A wrong or old code is refused on the box; offline and the daily limit say so for the whole form.
import { ref } from 'vue'
import FieldError from '@/components/FieldError.vue'
import { useFieldError, vFieldError } from '@/composables/useFieldError'
import { pairTv, cleanCode } from '@/tv/devices'
import { sayWhy } from '@/server/server'
import { messages } from '@/messages'
import { field, fieldLabel, primaryButtonSmall } from '@/ui/styles'

const props = defineProps<{ initialCode?: string }>()
const emit = defineEmits<{ paired: [] }>()
const m = messages.pairedDevices
const code = ref(props.initialCode ?? '')
const codeError = useFieldError()
const busy = ref(false)
const failure = ref('')
const done = ref('')

async function pair() {
  // Only this press's answer shows.
  codeError.clear()
  failure.value = ''
  done.value = ''
  if (!cleanCode(code.value)) return codeError.refuse(m.needCode)
  busy.value = true
  try {
    if (!(await pairTv(code.value))) return await codeError.refuse(m.badCode)
    code.value = ''
    done.value = m.paired
    emit('paired')
  } catch (err) {
    failure.value = sayWhy(err, { offline: m.offline, limit: m.limit, failed: m.failed })
  } finally {
    busy.value = false
  }
}
</script>
