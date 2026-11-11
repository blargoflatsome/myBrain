<template>
  <dialog ref="dialog" :class="confirmBox" role="alertdialog" :aria-label="heading" @close="emit('close')">
    <h2 class="text-lg font-semibold">{{ heading }}</h2>
    <p class="mt-2 text-muted">{{ body }}</p>
    <slot />
    <div class="mt-4 flex gap-2">
      <button type="button" :class="[dangerButton, 'flex-1']" @click="emit('confirm')">{{ confirmLabel }}</button>
      <button type="button" :class="[secondaryButton, 'flex-1']" @click="close">{{ keepLabel }}</button>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// The "are you sure?" window shown before anything removes data (SPEC §2 Confirm before impact).
import CloseX from '@/components/CloseX.vue'
import { ref } from 'vue'
import { confirmBox, dangerButton, secondaryButton } from '@/ui/styles'

defineProps<{ heading: string; body: string; confirmLabel: string; keepLabel: string }>()
const emit = defineEmits<{ confirm: []; close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
function open() {
  dialog.value?.showModal()
}
function close() {
  dialog.value?.close()
}
defineExpose({ open, close })
</script>
