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
        <div class="flex flex-col gap-3 py-4">
          <label class="flex items-center justify-between gap-4">
            <span>
              <span class="font-medium">{{ m.ntfy }}</span>
              <span class="block text-xs text-muted">{{ m.ntfyHint }}</span>
            </span>
            <input v-model="notifyNtfy" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
          </label>
          <div v-if="notifyNtfy" class="flex flex-col gap-1">
            <label class="flex flex-col gap-1 text-sm text-muted">
              {{ m.ntfyTopic }}
              <input v-model="topic" :class="field" autocomplete="off" spellcheck="false">
            </label>
            <span class="text-xs text-muted">{{ m.ntfyTopicHint }}</span>
            <button type="button" class="mt-1 min-h-11 self-start rounded-xl border border-line px-3 text-sm" @click="makeTopic">{{ m.ntfyMake }}</button>
          </div>
        </div>

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
            <input v-model="priorityRings" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-3 py-4" data-testid="journal-reminder">
          <legend class="contents">
            <span class="font-medium">{{ m.journalReminder }}</span>
          </legend>
          <p class="-mt-2 text-xs text-muted">{{ m.journalReminderHint }}</p>
          <label class="flex items-center justify-between gap-4 text-sm">
            {{ m.journalOff }}
            <input v-model="journalOff" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
          </label>
          <TimeInput v-if="!journalOff" v-model="journalTime" :label="m.journalTime" :input-class="field" />
        </fieldset>
      </template>
    </div>

    <div v-if="loaded" class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="save">{{ m.save }}</button>
      <button type="button" class="min-h-11 rounded-xl border border-line px-4 text-sm" @click="test">{{ m.test }}</button>
      <p v-if="notice" class="text-sm text-muted" role="status">{{ notice }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { isPushEndpoint } from '@/notifications/pushEndpoints'
import { isInstalled, isIOS } from '@/ui/device'
// SPEC §6: Web Push and/or ntfy, quiet hours, and whether priority reminders ring during them.
import TimeInput from '@/components/TimeInput.vue'
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { messages } from '@/messages'
import { field } from '@/ui/styles'

const auth = useAuthStore()
const m = messages.notifications
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const pushOn = ref(false)
const pushError = ref('')
const notifyNtfy = ref(false)
const topic = ref('')
const quietStart = ref('')
const quietEnd = ref('')
const priorityRings = ref(true)
// SPEC §5 Journal: optional daily journal reminder, off by default.
const journalOff = ref(true)
const journalTime = ref('21:00')
const loaded = ref(false)
const notice = ref('')

function base64UrlToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

onMounted(async () => {
  const { data } = await supabase
    .from('profiles')
    .select('notify_ntfy, ntfy_topic, quiet_hours_start, quiet_hours_end, quiet_hours_silence_priority, journal_reminder_time')
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()
  if (data) {
    notifyNtfy.value = !!data.notify_ntfy
    topic.value = data.ntfy_topic ?? ''
    quietStart.value = data.quiet_hours_start?.slice(0, 5) ?? ''
    quietEnd.value = data.quiet_hours_end?.slice(0, 5) ?? ''
    priorityRings.value = !data.quiet_hours_silence_priority
    journalOff.value = !data.journal_reminder_time
    if (data.journal_reminder_time) journalTime.value = data.journal_reminder_time.slice(0, 5)
    loaded.value = true
  }
  if (supported) {
    const reg = await navigator.serviceWorker.getRegistration()
    pushOn.value = !!(await reg?.pushManager.getSubscription())
  }
})

/** Turn notifications on or off for this device: one push subscription per device (SPEC §6). */
async function togglePush() {
  pushError.value = ''
  if (!supported || !VAPID) return (pushError.value = isIOS() && !isInstalled() ? m.webPushIphone : m.webPushUnsupported)
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint)
    await existing.unsubscribe()
    pushOn.value = false
    return
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return (pushError.value = m.webPushBlocked)
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID) })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  // Only real browser push services are kept (docs/SPEC.md §8); the sender refuses anything else anyway.
  if (!isPushEndpoint(json.endpoint)) {
    await sub.unsubscribe()
    pushError.value = m.webPushUnsupported
    return
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_label: navigator.userAgent.slice(0, 120), last_seen: new Date().toISOString() },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await sub.unsubscribe()
    pushError.value = m.webPushUnsupported
    return
  }
  pushOn.value = true
}

/** A long random topic name: anyone who knows it can read it (SPEC §13). */
function makeTopic() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  topic.value = `mybrain-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function save() {
  notice.value = ''
  const { error } = await supabase
    .from('profiles')
    .update({
      notify_ntfy: notifyNtfy.value && topic.value.length >= 16,
      ntfy_topic: topic.value || null,
      quiet_hours_start: quietStart.value || null,
      quiet_hours_end: quietEnd.value || null,
      quiet_hours_silence_priority: !priorityRings.value,
      journal_reminder_time: journalOff.value || !journalTime.value ? null : journalTime.value,
    })
    .eq('user_id', auth.user?.id ?? '')
  notice.value = error ? messages.profile.offline : m.saved
}

async function test() {
  notice.value = ''
  if (pushOn.value) {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(m.testTitle, { body: m.testBody, icon: '/pwa-192x192.png', data: { url: '/' } })
  }
  if (notifyNtfy.value && topic.value.length >= 16) {
    await fetch('https://ntfy.sh', { method: 'POST', body: JSON.stringify({ topic: topic.value, title: m.testTitle, message: m.testBody }) })
  }
  notice.value = m.testSent
}

</script>
