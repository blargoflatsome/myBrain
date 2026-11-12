<template>
  <button type="button" :class="rowDelete" :aria-label="label" data-testid="row-delete" @click="emit('click')">
    <AppIcon name="trash" size="size-5" />
  </button>
</template>

<script setup lang="ts">
// SPEC §2 Rows look alike everywhere: the trash can that ends every list row I can edit (the title opens the editor).
import AppIcon from '@/components/AppIcon.vue'
import { rowDelete } from '@/ui/styles'

defineProps<{ label: string }>()
const emit = defineEmits<{ click: [] }>()
</script>
