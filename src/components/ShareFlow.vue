<script setup lang="ts">
// SPEC §5 Cancelling (Phase 1 texting): one person at a time, open my messaging app (or email app) with their
// message ready; after I send it and come back, the next one, with "2 of 5", until everyone has been messaged.
import { computed, onMounted, ref, watch } from 'vue'
import { markShared, shareHref, type ShareTarget } from '@/events/sharing'
import { messages } from '@/messages'

const props = defineProps<{ targets: ShareTarget[]; kind: 'invite' | 'message' | 'cancel' }>()
const emit = defineEmits<{ done: [] }>()
const m = messages.share

const dialog = ref<HTMLDialogElement | null>(null)
const index = ref(0)
const sent = ref<string[]>([])
const current = computed(() => props.targets[index.value])
const finished = computed(() => index.value >= props.targets.length)

watch(
  () => props.targets,
  (t) => {
    index.value = 0
    sent.value = []
    if (t.length && !dialog.value?.open) dialog.value?.showModal()
  },
  { flush: 'post' },
)
onMounted(() => {
  if (props.targets.length && !dialog.value?.open) dialog.value?.showModal()
})

function next(wasSent: boolean) {
  if (wasSent && current.value) sent.value.push(current.value.inviteId)
  index.value++
}
async function close() {
  if (sent.value.length) await markShared(sent.value, props.kind).catch(() => {})
  dialog.value?.close()
  emit('done')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    :aria-label="m.heading"
    data-testid="share-flow"
    @cancel.prevent="close"
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">{{ m.heading }}</h2>
        <span v-if="!finished" class="text-sm text-muted" data-testid="share-progress">{{ m.progress(index + 1, targets.length) }}</span>
      </div>
      <p class="text-sm text-muted">{{ m.intro }}</p>
      <template v-if="current && !finished">
        <p class="font-medium" data-testid="share-to">{{ m.to(current.name || current.phone || current.email || '') }}</p>
        <p class="rounded-xl bg-bg p-3 text-sm whitespace-pre-wrap" data-testid="share-body">{{ current.body }}</p>
        <a
          :href="shareHref(current) ?? undefined"
          class="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-ink"
          data-testid="share-open"
        >{{ current.phone ? m.openText : m.openEmail }}</a>
        <div class="flex gap-2">
          <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3" @click="next(true)">{{ m.next }}</button>
          <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-muted" @click="next(false)">{{ m.skip }}</button>
        </div>
      </template>
      <template v-else>
        <p role="status">{{ m.finished }}</p>
        <button type="button" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="close">{{ m.done }}</button>
      </template>
    </div>
  </dialog>
</template>
