<template>
  <section class="flex flex-col" :aria-label="m.heading" data-testid="notification-settings">
    <div class="divide-y divide-line">
      <div class="flex flex-col gap-1 py-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="font-medium">{{ m.webPush }}</div>
            <p class="text-xs text-muted">{{ m.webPushHint }}</p>
          </div>
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-xl border px-3 text-sm"
            :class="pushOn ? 'choice-on border-accent bg-accent/10 font-semibold text-ink' : 'border-line'"
            :aria-pressed="pushOn"
            @click="togglePush"
          >
            {{ pushOn ? m.webPushOn : m.webPushOff }}
          </button>
        </div>
        <p v-if="pushError" class="text-sm text-danger" role="alert">{{ pushError }}</p>
      </div>

      <template v-if="loaded">
        <fieldset class="flex flex-col gap-3 py-4">
          <legend class="contents">
            <span class="font-medium">{{ m.quietHours }}</span>
          </legend>
          <p class="-mt-2 text-xs text-muted">{{ m.quietHint }}</p>
          <div class="grid grid-cols-2 gap-3">
            <TimeInput v-model="quietStart" :label="m.quietStart" :input-class="field" />
            <TimeInput v-model="quietEnd" :label="m.quietEnd" :input-class="field" />
          </div>
          <label class="flex items-center justify-between gap-4 text-sm">
            {{ m.priorityQuiet }}
            <input v-model="priorityRings" type="checkbox" :class="checkbox">
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-3 py-4" data-testid="evening-reminder">
          <legend class="contents">
            <span class="font-medium">{{ m.eveningReminder }}</span>
          </legend>
          <p class="-mt-2 text-xs text-muted">{{ m.eveningReminderHint }}</p>
          <label class="flex items-center justify-between gap-4 text-sm">
            {{ m.eveningOff }}
            <input v-model="eveningOff" type="checkbox" :class="checkbox">
          </label>
          <TimeInput v-if="!eveningOff" v-model="eveningTime" :label="m.eveningTime" :input-class="field" />
        </fieldset>
      </template>
    </div>

    <div v-if="loaded" class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <button type="button" :class="primaryButtonSmall" @click="save">{{ m.save }}</button>
      <button type="button" :class="smallButton" @click="test">{{ m.test }}</button>
      <p v-if="notice" class="text-sm text-muted" role="status">{{ notice }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §6: Web Push, quiet hours, and whether priority reminders ring during them.
import { useProfileStore } from '@/stores/profile'
import { useSettingSave } from '@/composables/useSettingSave'
import TimeInput from '@/components/TimeInput.vue'
import { onMounted, ref } from 'vue'
import { isPushOn, sendTestPush, turnPushOff, turnPushOn, type PushRefusal } from '@/notifications/push'
import { messages } from '@/messages'
import { checkbox, field, primaryButtonSmall, smallButton } from '@/ui/styles'

const m = messages.notifications

const pushOn = ref(false)
const pushError = ref('')
const quietStart = ref('')
const quietEnd = ref('')
const priorityRings = ref(true)
// SPEC §5 Journal: the evening reminder, on at 9:00 pm by default.
const eveningOff = ref(false)
const eveningTime = ref('21:00')
const loaded = ref(false)
const notice = ref('')

onMounted(async () => {
  const data = await useProfileStore().load()
  if (data) {
    quietStart.value = data.quiet_hours_start?.slice(0, 5) ?? ''
    quietEnd.value = data.quiet_hours_end?.slice(0, 5) ?? ''
    priorityRings.value = !data.quiet_hours_silence_priority
    eveningOff.value = !data.evening_reminder_time
    if (data.evening_reminder_time) eveningTime.value = data.evening_reminder_time.slice(0, 5)
    loaded.value = true
  }
  pushOn.value = await isPushOn()
})

const refusals: Record<PushRefusal, string> = {
  unsupported: m.webPushUnsupported,
  install: m.webPushIphone,
  blocked: m.webPushBlocked,
  offline: m.webPushOffline,
  limit: m.webPushUnsupported,
  failed: m.webPushUnsupported,
}

/** Turn notifications on or off for this device: one push subscription per device (SPEC §6). */
async function togglePush() {
  pushError.value = ''
  if (pushOn.value) {
    await turnPushOff()
    pushOn.value = false
    return
  }
  const refused = await turnPushOn()
  if (refused) pushError.value = refusals[refused]
  pushOn.value = !refused
}

const settingSave = useSettingSave()
async function save() {
  notice.value = ''
  await settingSave.saveProfile({
    quiet_hours_start: quietStart.value || null,
    quiet_hours_end: quietEnd.value || null,
    quiet_hours_silence_priority: !priorityRings.value,
    evening_reminder_time: eveningOff.value || !eveningTime.value ? null : eveningTime.value,
  })
  notice.value = settingSave.notice
}

async function test() {
  notice.value = ''
  await sendTestPush(m.testTitle, m.testBody)
  notice.value = m.testSent
}

</script>
