<template>
  <dialog ref="dialog" :class="boxClass ?? dialogBox" :aria-label="heading" @close="emit('close')">
    <!-- Built only while open: a closed editor would otherwise load and run the formatting editor on every page
         that has one (docs/CODING_STANDARDS.md §10). -->
    <form v-if="open" class="flex flex-col gap-8 p-5" :novalidate="novalidate" :data-testid="testId" @submit.prevent="emit('save')">
      <h2 class="text-lg font-semibold">{{ heading }}</h2>
      <slot />
      <div class="flex flex-wrap gap-2">
        <button type="submit" :class="[primaryButton, 'flex-1']">{{ saveLabel }}</button>
        <button type="button" :class="secondaryButton" @click="close">{{ closeLabel }}</button>
      </div>
      <slot name="actions" />
      <button v-if="deleteLabel" type="button" :class="deleteLink" @click="emit('delete')">{{ deleteLabel }}</button>
    </form>
    <CloseX @click="close" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §2 Windows: the editor window every item uses: heading, its fields, Save and Close, extra actions, then the
// quiet Delete link, and the close ✕. It opens while `open` is true; closing it any way emits close.
import { nextTick, ref, watch } from 'vue'
import CloseX from '@/components/CloseX.vue'
import { deleteLink, dialogBox, primaryButton, secondaryButton } from '@/ui/styles'

const props = withDefaults(
  defineProps<{
    open: boolean
    heading: string
    saveLabel: string
    closeLabel: string
    /** Shown only when given (new items have nothing to delete). */
    deleteLabel?: string | null
    boxClass?: string
    novalidate?: boolean
    testId?: string
  }>(),
  { deleteLabel: null, boxClass: undefined, novalidate: false, testId: undefined },
)
const emit = defineEmits<{ save: []; delete: []; close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
function close() {
  dialog.value?.close()
}
watch(
  () => props.open,
  async (open) => {
    if (!open) return close()
    // After the form is drawn, so the window's first field gets focus.
    await nextTick()
    if (!dialog.value?.open) dialog.value?.showModal()
  },
  { immediate: true },
)
defineExpose({ close })
</script>
