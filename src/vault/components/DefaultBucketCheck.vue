<template>
  <label class="flex items-center justify-between gap-4">
    <span>
      <span class="font-medium">{{ m.isDefault }}</span>
      <span class="block text-xs text-muted">{{ m.isDefaultHint }}</span>
    </span>
    <input v-model="on" type="checkbox" :class="checkbox" data-testid="bucket-default-check">
  </label>
</template>

<script setup lang="ts">
// SPEC §5 The Vault, Default bucket: the one checkbox, the same in my own bucket's settings and a shared one's.
import { messages } from '@/messages'
import { checkbox } from '@/ui/styles'

const on = defineModel<boolean>({ required: true })
const m = messages.vault.bucketEditor
</script>
