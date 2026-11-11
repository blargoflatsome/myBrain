<template>
  <dialog
    ref="dialog"
    :aria-label="messages.capture.windowLabel"
    class="m-0 h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-black/50 md:m-auto md:h-auto md:max-h-[90dvh] md:max-w-xl md:rounded-2xl md:border md:border-line"
    data-testid="capture-dialog"
    @close="capture.close()"
  >
    <div class="flex flex-col gap-3 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div class="-mx-4 flex min-h-11 items-center border-b border-line px-4 pr-14 pb-3">
        <span class="text-sm font-medium text-muted">{{ messages.capture.windowLabel }}</span>
      </div>
      <CaptureForm v-if="capture.isOpen" :key="capture.opened" />
    </div>
    <CloseX :label="messages.capture.close" @click="capture.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Quick capture: the Capture window, over the current page. Full screen on a phone, centred on wider screens.
import CloseX from '@/components/CloseX.vue'
import { nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CaptureForm from '@/components/CaptureForm.vue'
import { useCaptureStore } from '@/stores/capture'
import { messages } from '@/messages'

const capture = useCaptureStore()
const route = useRoute()
const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => capture.isOpen,
  async (open) => {
    await nextTick()
    if (open && !dialog.value?.open) dialog.value?.showModal()
    if (!open && dialog.value?.open) dialog.value.close()
  },
)
// Moving to another page closes it.
watch(() => route.fullPath, () => capture.close())
</script>
