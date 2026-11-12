<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    role="alertdialog"
    :aria-label="mode === 'cancel' ? m.headingCancel : m.headingDrop"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ mode === 'cancel' ? m.headingCancel : m.headingDrop }}</h2>
      <template v-if="people.length">
        <p class="text-sm text-muted">{{ mode === 'cancel' ? m.whoCancel : m.whoDrop }}</p>
        <ul class="flex list-disc flex-col gap-0.5 pl-5 text-sm" data-testid="cancel-who">
          <li v-for="p in people" :key="p.invite_id">{{ p.name || p.email || p.phone }}</li>
        </ul>
        <p class="text-sm text-muted">{{ m.preview }}</p>
        <p class="rounded-xl bg-bg p-3 text-sm" data-testid="cancel-preview">{{ preview }}</p>
      </template>
      <p v-else-if="!error" class="text-sm text-muted">{{ m.nobody }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex gap-2">
        <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink disabled:opacity-50" :disabled="busy || !brain.online" @click="confirm">
          {{ mode === 'cancel' ? m.confirmCancel : m.confirmDrop }}
        </button>
        <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.keep }}</button>
      </div>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Cancelling: "Cancel and notify". The confirmation lists exactly who will be told and shows my message;
// nothing is sent unless I confirm. The creator cancels for everyone; an attendee only drops out.
import CloseX from '@/components/CloseX.vue'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { cancelEvent, dropOut, eventPeople, whenText, type EventPerson, type ShareTarget } from '@/events/sharing'
import { messages } from '@/messages'
import type { EventRow } from '@/sync/types'

const props = defineProps<{ event: EventRow | null; mode: 'cancel' | 'drop' }>()
const emit = defineEmits<{ done: [ShareTarget[]]; close: [] }>()
const m = messages.cancelEvent
const auth = useAuthStore()
const brain = useBrainStore()

const dialog = ref<HTMLDialogElement | null>(null)
const people = ref<EventPerson[]>([])
const template = ref('')
const error = ref('')
const busy = ref(false)

watch(
  () => props.event,
  async (e) => {
    if (!e) return dialog.value?.close()
    error.value = ''
    people.value = []
    dialog.value?.showModal()
    if (!brain.online) return (error.value = m.offline)
    people.value = (await eventPeople(e.id).catch(() => [])).filter((p) => !p.is_me && p.response !== 'no' && p.response !== 'dropped')
    const { data } = await supabase.from('profiles').select('cancel_event_message, cancel_dropout_message').eq('user_id', auth.user?.id ?? '').maybeSingle()
    template.value = (props.mode === 'cancel' ? data?.cancel_event_message : data?.cancel_dropout_message) ?? ''
  },
)

const preview = computed(() => {
  const e = props.event
  if (!e) return ''
  const [date, time] = whenText(e).split(' at ')
  // An all-day event has no time: "on Saturday, November 7", not "at all day".
  const text = e.start_time ? template.value : template.value.replaceAll(' at {{time}}', '')
  return text
    .replaceAll('{{name}}', people.value[0]?.name || 'there')
    .replaceAll('{{event}}', e.title)
    .replaceAll('{{date}}', date ?? '')
    .replaceAll('{{time}}', time ?? 'all day')
})

async function confirm() {
  const e = props.event
  if (!e) return
  if (!brain.online) return (error.value = m.offline)
  busy.value = true
  error.value = ''
  try {
    let targets: ShareTarget[] = []
    if (props.mode === 'cancel') {
      const rows = await cancelEvent(e.id)
      targets = rows
        .filter((r) => r.email || r.phone)
        .map((r) => ({ inviteId: r.invite_id, name: r.name, email: r.email, phone: r.phone, subject: `${e.title} is cancelled`, body: r.body }))
    } else {
      await dropOut(e.id)
    }
    await brain.refresh(['events', 'event_invites'])
    dialog.value?.close()
    emit('done', targets)
  } catch (err) {
    error.value = m.failed(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>
