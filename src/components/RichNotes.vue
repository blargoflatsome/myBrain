<template>
  <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
  <div v-if="html" class="rich" v-html="html" />
</template>

<script setup lang="ts">
// SPEC §5 Formatted notes: notes shown read-only, cleaned first (SPEC §8). Notes written before formatting existed are
// plain text, and show as paragraphs.
import { computed } from 'vue'
import { cleanHtml, plainText } from '@/journal/body'

const props = defineProps<{ value?: string | null }>()
const html = computed(() => (props.value && plainText(props.value) ? cleanHtml(props.value) : ''))
</script>
