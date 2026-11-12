<template>
  <button
    type="button"
    :role="role"
    class="group -m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full"
    :aria-label="label"
    :aria-pressed="role === 'button' ? on : undefined"
    :aria-checked="role === 'checkbox' ? on : undefined"
    :disabled="disabled"
    @click="emit('click')"
  >
    <span
      class="relative flex size-8 items-center justify-center rounded-full border-2 transition-colors"
      :class="on ? 'border-accent bg-accent text-accent-ink' : muted ? 'border-line text-muted' : 'border-muted'"
    >
      <svg v-if="on" aria-hidden="true" viewBox="0 0 24 24" class="size-4" :class="{ 'celebrate-draw': drawIn }" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" data-testid="check-mark">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
// SPEC §2 Check circles look alike everywhere: crossing off a task, completing a habit, checking a Vault item.
// A 44 px target around a 32 px circle with a drawn check (WCAG 2.5.8; 44 px where practical).
withDefaults(
  defineProps<{ on: boolean; label: string; role?: 'button' | 'checkbox'; disabled?: boolean; muted?: boolean; drawIn?: boolean }>(),
  { role: 'button', disabled: false, muted: false, drawIn: false },
)
const emit = defineEmits<{ click: [] }>()
</script>
