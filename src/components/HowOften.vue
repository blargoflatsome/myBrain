<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted  pb-2">{{ m.label }}</span>
    <div class="flex flex-wrap justify-between gap-2" role="radiogroup" :aria-label="m.label">
      <button type="button" role="radio" :aria-checked="choice === 'weekly'" :class="[chip(choice === 'weekly'), 'flex-1']" @click="pick('weekly')">{{ m.weekly }}</button>
      <button type="button" role="radio" :aria-checked="choice === 'biweekly'" :class="[chip(choice === 'biweekly'), 'flex-1']" @click="pick('biweekly')">{{ m.biweekly }}</button>
      <button
        v-if="monthly !== undefined"
        type="button"
        role="radio"
        :aria-checked="choice === 'monthly'"
        :class="[chip(choice === 'monthly'), 'flex-1']"
        @click="pick('monthly')"
      >
        {{ startDate ? m.monthlyOn(Number(startDate.slice(8, 10))) : m.monthly }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §5: things that repeat on chosen weekdays can repeat every week or every 2 weeks; habits can also repeat
// every month on their start date's day (pass v-model:monthly to offer it).
import { computed } from 'vue'
import { messages } from '@/messages'
import { chip } from '@/ui/styles'

const props = defineProps<{ modelValue: number; monthly?: boolean; startDate?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number]; 'update:monthly': [value: boolean] }>()
const m = messages.howOften

const choice = computed(() => (props.monthly ? 'monthly' : props.modelValue === 2 ? 'biweekly' : 'weekly'))
function pick(to: 'weekly' | 'biweekly' | 'monthly') {
  if (props.monthly !== undefined) emit('update:monthly', to === 'monthly')
  if (to !== 'monthly') emit('update:modelValue', to === 'biweekly' ? 2 : 1)
}
</script>
