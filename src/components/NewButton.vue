<template>
  <button type="button" :class="newButton" @click="emit('click')"><AppIcon name="plus" />{{ label }}</button>
</template>

<script setup lang="ts">
// SPEC §2 Adding looks alike everywhere: the "+ New …" button at the right of a list page's heading.
import AppIcon from '@/components/AppIcon.vue'
import { newButton } from '@/ui/styles'

defineProps<{ label: string }>()
const emit = defineEmits<{ click: [] }>()
</script>
