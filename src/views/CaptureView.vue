<script setup lang="ts">
// SPEC §5 Quick capture: type or paste (or speak), then choose where it goes. Works offline.
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DestinationPicker from '@/components/DestinationPicker.vue'
import { useBrainStore } from '@/stores/brain'
import { useSpeech } from '@/composables/useSpeech'
import { sharedText, type CaptureInput } from '@/capture/capture'
import { messages } from '@/messages'
import type { VaultBucketRow } from '@/sync/types'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.capture

const text = ref('')
const notice = ref('')
const error = ref('')
const saving = ref(false)
const box = ref<HTMLTextAreaElement | null>(null)
const picker = ref<InstanceType<typeof DestinationPicker> | null>(null)

const speech = useSpeech((heard) => {
  text.value = text.value ? `${text.value} ${heard}` : heard
})

onMounted(async () => {
  // SPEC §3: text shared from another app arrives in the query (Web Share Target).
  const shared = sharedText(route.query)
  if (shared) {
    text.value = shared
    await router.replace({ query: {} })
  }
  await nextTick()
  box.value?.focus()
})

async function savedMessage(choice: Omit<CaptureInput, 'text'>) {
  if (!brain.online) return m.savedOffline
  switch (choice.destination) {
    case 'task':
      return choice.dueDate ? m.saved.task : m.saved.taskUndated
    case 'vault': {
      const bucket: VaultBucketRow | undefined = choice.bucketId ? await brain.db?.vault_buckets.get(choice.bucketId) : undefined
      return m.saved.vault(bucket?.name ?? messages.capture.destinations.vault)
    }
    case 'quest':
      return m.saved.quest
    case 'later':
      return m.saved.later
  }
}

async function save(choice: Omit<CaptureInput, 'text'>) {
  error.value = ''
  notice.value = ''
  if (!text.value.trim()) {
    error.value = m.emptyError
    picker.value?.reset()
    box.value?.focus()
    return
  }
  saving.value = true
  try {
    await brain.capture({ ...choice, text: text.value })
    notice.value = await savedMessage(choice)
    text.value = ''
    picker.value?.reset()
    box.value?.focus()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
    <h1 class="sr-only">{{ m.openButton }}</h1>
    <div class="relative">
      <textarea
        ref="box"
        v-model="text"
        rows="4"
        :placeholder="m.placeholder"
        :aria-label="m.placeholder"
        class="w-full resize-none rounded-2xl border border-line bg-surface p-4 pr-28 text-lg text-ink shadow-sm outline-none focus:border-accent"
        @input="error = ''"
      />
      <button
        v-if="speech.supported"
        type="button"
        class="absolute right-3 bottom-3 min-h-10 rounded-full border border-line bg-bg px-3 text-sm text-ink"
        :aria-pressed="speech.listening.value"
        @click="speech.listening.value ? speech.stop() : speech.start()"
      >
        🎙 {{ speech.listening.value ? m.micListening : m.micStart }}
      </button>
    </div>
    <p v-if="speech.failed.value" class="text-sm text-danger" role="alert">{{ m.micError }}</p>

    <h2 class="text-sm font-medium text-muted">{{ m.whereHeading }}</h2>
    <DestinationPicker ref="picker" :disabled="saving" @choose="save" />

    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-surface p-3 text-ink" role="status" data-testid="capture-notice">{{ notice }}</p>
  </main>
</template>
