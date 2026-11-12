<template>
  <img
    v-if="url && !failed"
    :src="url"
    alt=""
    :class="[box, 'rounded-full border border-line object-cover']"
    referrerpolicy="no-referrer"
    data-testid="avatar-picture"
    @error="failed = true"
  >
  <span v-else :class="[box, 'flex shrink-0 items-center justify-center rounded-full bg-surface text-muted']" aria-hidden="true" data-testid="avatar-icon">
    <AppIcon name="user" :size="icon" />
  </span>
</template>

<script setup lang="ts">
// SPEC §5 Account page, Profiles: someone's Google profile picture, or the plain person icon when there is none or it
// can't load. Decorative: the name beside it says who it is.
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = withDefaults(defineProps<{ url: string | null | undefined; size?: 'sm' | 'lg' }>(), { size: 'sm' })
const failed = ref(false)
watch(() => props.url, () => (failed.value = false))
const box = computed(() => (props.size === 'lg' ? 'size-16' : 'size-8'))
const icon = computed(() => (props.size === 'lg' ? 'size-12' : 'size-6'))
</script>
